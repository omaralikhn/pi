import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderLoginStore } from "../src/core/provider-login-store.ts";

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
