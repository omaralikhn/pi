import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderLoginStore } from "../src/core/provider-login-store.ts";

describe("ProviderLoginStore", () => {
	const directories: string[] = [];
	const originalApiKey = process.env.PI_PROVIDER_LOGIN_TEST_KEY;

	afterEach(() => {
		if (originalApiKey === undefined) delete process.env.PI_PROVIDER_LOGIN_TEST_KEY;
		else process.env.PI_PROVIDER_LOGIN_TEST_KEY = originalApiKey;
		for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
	});

	it("persists the environment mapping and active login without an API key", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-provider-logins-"));
		directories.push(directory);
		process.env.PI_PROVIDER_LOGIN_TEST_KEY = "test-key";
		const path = join(directory, "provider-logins.json");
		const store = new ProviderLoginStore(path);

		await store.create("faux", "personal", "PI_PROVIDER_LOGIN_TEST_KEY");

		expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
			version: 1,
			providers: {
				faux: {
					activeLogin: "personal",
					logins: { personal: { env: "PI_PROVIDER_LOGIN_TEST_KEY" } },
				},
			},
		});
		expect(store.resolveActive("faux")).toEqual({ name: "personal", apiKey: "test-key" });
	});
});
