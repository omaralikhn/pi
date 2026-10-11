import { describe, expect, it, vi } from "vitest";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";

describe("RpcClient model selection", () => {
	it("sends a named login with the model selection", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const send = vi.fn(async () => ({
			type: "response",
			command: "set_model",
			success: true,
			data: { provider: "openai", id: "gpt-5", contextWindow: 128000, reasoning: true, loginName: "personal" },
		}));
		privateClient.send = send;
		privateClient.getData = <T>(response: unknown): T => {
			return (response as { data: T }).data;
		};

		const selected = await client.setModel("openai", "gpt-5", "personal");

		expect(send).toHaveBeenCalledWith({
			type: "set_model",
			provider: "openai",
			modelId: "gpt-5",
			loginName: "personal",
		});
		expect(selected).toEqual({
			provider: "openai",
			id: "gpt-5",
			contextWindow: 128000,
			reasoning: true,
			loginName: "personal",
		});
	});
});

type RpcClientPrivate = {
	send: (command: { type: string }) => Promise<unknown>;
	getData: <T>(response: unknown) => T;
};
