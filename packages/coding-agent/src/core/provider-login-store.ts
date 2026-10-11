import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { getProviderLoginsPath } from "../config.ts";
import { normalizePath } from "../utils/paths.ts";
import { stripBom } from "../utils/text.ts";

const LOGIN_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROVIDER_LOGINS_VERSION = 1;
const PROVIDER_LOGINS_FILE_OPTIONS = { encoding: "utf-8", mode: 0o600 } as const;

type ProviderLoginDocument = {
	version: 1;
	providers: Record<string, ProviderLoginProvider>;
};

type ProviderLoginProvider = {
	activeLogin?: string;
	logins: Record<string, { env: string }>;
};

export type ProviderLogin = {
	name: string;
	env: string;
	available: boolean;
	active: boolean;
};

export type ResolvedProviderLogin = {
	name: string;
	apiKey: string;
};

export class ProviderLoginError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderLoginError";
	}
}

export class ProviderLoginStore {
	private readonly path: string;
	private data: ProviderLoginDocument = emptyDocument();
	private error: Error | undefined;

	constructor(path: string = getProviderLoginsPath()) {
		this.path = normalizePath(path);
		this.reload();
	}

	getPath(): string {
		return this.path;
	}

	getError(): Error | undefined {
		return this.error;
	}

	reload(): void {
		try {
			this.data = this.readDocument();
			this.error = undefined;
		} catch (error) {
			this.error = asError(error);
		}
	}

	list(providerId: string): readonly ProviderLogin[] {
		this.reload();
		if (this.error) throw this.error;
		const provider = this.data.providers[providerId];
		if (!provider) return [];
		return Object.entries(provider.logins).map(([name, login]) => ({
			name,
			env: login.env,
			available: getEnvironmentValue(login.env) !== undefined,
			active: provider.activeLogin === name,
		}));
	}

	getActiveLogin(providerId: string): string | undefined {
		this.reload();
		return this.data.providers[providerId]?.activeLogin;
	}

	resolveActive(providerId: string): ResolvedProviderLogin | undefined {
		this.reload();
		const activeLogin = this.data.providers[providerId]?.activeLogin;
		if (!activeLogin) return undefined;
		const login = this.data.providers[providerId]?.logins[activeLogin];
		if (!login) return undefined;
		const apiKey = getEnvironmentValue(login.env);
		if (!apiKey) {
			throw new ProviderLoginError(
				`Environment variable "${login.env}" for named login "${activeLogin}" is missing or empty.`,
			);
		}
		return { name: activeLogin, apiKey };
	}

	resolve(providerId: string, loginName: string): ResolvedProviderLogin {
		this.reload();
		if (this.error) throw this.error;
		const login = this.data.providers[providerId]?.logins[loginName];
		if (!login)
			throw new ProviderLoginError(`Named login "${loginName}" does not exist for provider "${providerId}".`);
		const apiKey = getEnvironmentValue(login.env);
		if (!apiKey) {
			throw new ProviderLoginError(
				`Environment variable "${login.env}" for named login "${loginName}" is missing or empty.`,
			);
		}
		return { name: loginName, apiKey };
	}

	async create(providerId: string, loginName: string, env: string): Promise<void> {
		validateProviderId(providerId);
		validateLoginName(loginName);
		validateEnvironmentVariable(env);
		assertEnvironmentValue(env, loginName);
		await this.mutate((document) => {
			const provider = document.providers[providerId] ?? { logins: {} };
			if (provider.logins[loginName]) {
				throw new ProviderLoginError(`Named login "${loginName}" already exists for provider "${providerId}".`);
			}
			document.providers[providerId] = {
				...provider,
				activeLogin: loginName,
				logins: { ...provider.logins, [loginName]: { env } },
			};
		});
	}

	async activate(providerId: string, loginName: string): Promise<void> {
		validateProviderId(providerId);
		validateLoginName(loginName);
		await this.mutate((document) => {
			const provider = document.providers[providerId];
			const login = provider?.logins[loginName];
			if (!provider || !login) {
				throw new ProviderLoginError(`Named login "${loginName}" does not exist for provider "${providerId}".`);
			}
			assertEnvironmentValue(login.env, loginName);
			provider.activeLogin = loginName;
		});
	}

	async deactivate(providerId: string): Promise<void> {
		validateProviderId(providerId);
		await this.mutate((document) => {
			const provider = document.providers[providerId];
			if (provider) delete provider.activeLogin;
		});
	}

	private readDocument(): ProviderLoginDocument {
		if (!existsSync(this.path)) return emptyDocument();
		return parseDocument(readFileSync(this.path, "utf-8"), this.path);
	}

	private async mutate(change: (document: ProviderLoginDocument) => void): Promise<void> {
		if (this.error) throw this.error;
		const parent = dirname(this.path);
		if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
		const lockPath = `${this.path}.lock`;
		if (!existsSync(lockPath)) writeFileSync(lockPath, "", PROVIDER_LOGINS_FILE_OPTIONS);
		const release = await lockfile.lock(lockPath, { realpath: false });
		try {
			const current = this.readDocument();
			change(current);
			validateDocument(current, this.path);
			this.writeDocument(current);
			this.data = current;
			this.error = undefined;
		} finally {
			await release();
		}
	}

	private writeDocument(document: ProviderLoginDocument): void {
		const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
		try {
			writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, PROVIDER_LOGINS_FILE_OPTIONS);
			renameSync(temporaryPath, this.path);
		} finally {
			if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
		}
	}
}

function emptyDocument(): ProviderLoginDocument {
	return { version: PROVIDER_LOGINS_VERSION, providers: {} };
}

function parseDocument(content: string, path: string): ProviderLoginDocument {
	let value: unknown;
	try {
		value = JSON.parse(stripBom(content));
	} catch (error) {
		throw new ProviderLoginError(`Failed to parse provider logins at ${path}: ${asError(error).message}`);
	}
	return validateDocument(value, path);
}

function validateDocument(value: unknown, path: string): ProviderLoginDocument {
	if (!isRecord(value) || value.version !== PROVIDER_LOGINS_VERSION || !isRecord(value.providers)) {
		throw new ProviderLoginError(
			`Invalid provider logins at ${path}: expected version ${PROVIDER_LOGINS_VERSION} document.`,
		);
	}
	const providers: Record<string, ProviderLoginProvider> = {};
	for (const [providerId, provider] of Object.entries(value.providers)) {
		validateProviderId(providerId);
		if (!isRecord(provider) || !isRecord(provider.logins)) {
			throw new ProviderLoginError(`Invalid named logins for provider "${providerId}".`);
		}
		const logins: Record<string, { env: string }> = {};
		for (const [loginName, login] of Object.entries(provider.logins)) {
			validateLoginName(loginName);
			if (!isRecord(login) || typeof login.env !== "string") {
				throw new ProviderLoginError(`Invalid named login "${loginName}" for provider "${providerId}".`);
			}
			validateEnvironmentVariable(login.env);
			logins[loginName] = { env: login.env };
		}
		if (provider.activeLogin !== undefined) {
			if (typeof provider.activeLogin !== "string" || !logins[provider.activeLogin]) {
				throw new ProviderLoginError(`Invalid active named login for provider "${providerId}".`);
			}
			providers[providerId] = { logins, activeLogin: provider.activeLogin };
		} else {
			providers[providerId] = { logins };
		}
	}
	return { version: PROVIDER_LOGINS_VERSION, providers };
}

function validateProviderId(providerId: string): void {
	if (!providerId.trim()) throw new ProviderLoginError("Provider ID must not be empty.");
}

function validateLoginName(loginName: string): void {
	if (!LOGIN_NAME_PATTERN.test(loginName)) {
		throw new ProviderLoginError(
			`Invalid named login "${loginName}". Names must start with a letter and contain up to 64 letters, numbers, hyphens, or underscores.`,
		);
	}
}

function validateEnvironmentVariable(env: string): void {
	if (!ENVIRONMENT_VARIABLE_PATTERN.test(env)) {
		throw new ProviderLoginError(`Invalid environment variable name "${env}".`);
	}
}

function assertEnvironmentValue(env: string, loginName: string): void {
	if (!getEnvironmentValue(env)) {
		throw new ProviderLoginError(`Environment variable "${env}" for named login "${loginName}" is missing or empty.`);
	}
}

function getEnvironmentValue(env: string): string | undefined {
	const value = process.env[env]?.trim();
	return value || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
