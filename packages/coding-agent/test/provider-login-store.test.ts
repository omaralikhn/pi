import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import { ProviderLoginStore } from "../src/core/provider-login-store.ts";
import { RuntimeCredentials } from "../src/core/runtime-credentials.ts";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createTestResourceLoader } from "./utilities.ts";

describe("ProviderLoginStore", () => {
	const originalKey = process.env.TEST_NAMED_LOGIN_KEY;
	let temporaryDirectory: string | undefined;

	afterEach(() => {
		if (originalKey === undefined) delete process.env.TEST_NAMED_LOGIN_KEY;
		else process.env.TEST_NAMED_LOGIN_KEY = originalKey;
		if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
		temporaryDirectory = undefined;
	});

	it("stores environment-variable names and activates the new login", async () => {
		process.env.TEST_NAMED_LOGIN_KEY = "test-key";
		const path = createPath();
		const store = new ProviderLoginStore(path);

		await store.create("openai", "work", "TEST_NAMED_LOGIN_KEY");

		expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
			version: 1,
			providers: { openai: { activeLogin: "work", logins: { work: { env: "TEST_NAMED_LOGIN_KEY" } } } },
		});
		expect(readFileSync(path, "utf-8")).not.toContain("test-key");
		expect(store.list("openai")).toEqual([
			{ name: "work", env: "TEST_NAMED_LOGIN_KEY", available: true, active: true },
		]);
	});

	it("resolves a rotated environment value on each request", async () => {
		process.env.TEST_NAMED_LOGIN_KEY = "first-key";
		const store = new ProviderLoginStore(createPath());
		await store.create("openai", "work", "TEST_NAMED_LOGIN_KEY");
		process.env.TEST_NAMED_LOGIN_KEY = "second-key";

		expect(store.resolveActive("openai")).toEqual({ name: "work", apiKey: "second-key" });
	});

	it("keeps an open session on its login when another session selects the ordinary model", async () => {
		process.env.TEST_NAMED_LOGIN_KEY = "named-key";
		const path = createPath();
		const first = new ProviderLoginStore(path);
		await first.create("openai", "work", "TEST_NAMED_LOGIN_KEY");
		const second = new ProviderLoginStore(path);
		const credentials = AuthStorage.inMemory({ openai: { type: "api_key", key: "ordinary-key" } });
		const firstRuntime = await ModelRuntime.create({ credentials, modelsPath: null, providerLogins: first });

		await second.deactivate("openai");

		expect(firstRuntime.getActiveNamedLogin("openai")).toBe("work");
		expect((await firstRuntime.getAuth("openai"))?.auth.apiKey).toBe("named-key");
		expect(await new RuntimeCredentials(credentials, second).read("openai")).toEqual({
			type: "api_key",
			key: "ordinary-key",
		});
		expect(await new RuntimeCredentials(credentials, new ProviderLoginStore(path)).read("openai")).toEqual({
			type: "api_key",
			key: "ordinary-key",
		});
	});

	it.each([
		{ loginName: "work", expectedKey: "named-key", defaultLogin: undefined },
		{ loginName: undefined, expectedKey: "ordinary-key", defaultLogin: "work" },
	])("restores $loginName after a response without changing the login default", async (scenario) => {
		process.env.TEST_NAMED_LOGIN_KEY = "named-key";
		const path = createPath();
		const store = new ProviderLoginStore(path);
		await store.create("openai", "work", "TEST_NAMED_LOGIN_KEY");
		if (scenario.defaultLogin === undefined) await store.deactivate("openai");
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory({ openai: { type: "api_key", key: "ordinary-key" } }),
			modelsPath: null,
			providerLoginsPath: path,
		});
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendModelChange("openai", "gpt-5.5", scenario.loginName);
		sessionManager.appendMessage({
			...fauxAssistantMessage("Hello"),
			api: "openai-responses",
			provider: "openai",
			model: "gpt-5.5",
		});

		const { session, modelFallbackMessage } = await createAgentSession({
			modelRuntime: runtime,
			resourceLoader: createTestResourceLoader(),
			sessionManager,
			settingsManager: SettingsManager.inMemory(),
		});
		onTestFinished(() => session.dispose());

		expect(modelFallbackMessage).toBeUndefined();
		expect(session.model?.id).toBe("gpt-5.5");
		expect(runtime.getActiveNamedLogin("openai")).toBe(scenario.loginName);
		expect((await runtime.getAuth("openai"))?.auth.apiKey).toBe(scenario.expectedKey);
		expect(new ProviderLoginStore(path).getActiveLogin("openai")).toBe(scenario.defaultLogin);
	});

	it("rejects an unavailable login without creating configuration", async () => {
		delete process.env.TEST_NAMED_LOGIN_KEY;
		const path = createPath();
		const store = new ProviderLoginStore(path);

		await expect(store.create("openai", "work", "TEST_NAMED_LOGIN_KEY")).rejects.toThrow(
			'Environment variable "TEST_NAMED_LOGIN_KEY" for named login "work" is missing or empty.',
		);
		expect(existsSync(path)).toBe(false);
	});

	it.skipIf(process.platform === "win32")("creates configuration with owner-only permissions", async () => {
		process.env.TEST_NAMED_LOGIN_KEY = "test-key";
		const path = createPath();
		const store = new ProviderLoginStore(path);

		await store.create("openai", "work", "TEST_NAMED_LOGIN_KEY");

		expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	function createPath(): string {
		temporaryDirectory = mkdtempSync(join(tmpdir(), "pi-provider-logins-"));
		return join(temporaryDirectory, "agent", "provider-logins.json");
	}
});
