import { Type } from "typebox";
import { describe, expect, test } from "vitest";
import {
	captureProviderContext,
	formatProviderContextReport,
	type ProviderContextReport,
} from "../src/core/provider-context-report.ts";
import type { Skill } from "../src/core/skills.ts";
import { createHarness } from "./suite/harness.ts";
import { createTestExtensionsResult, createTestResourceLoader } from "./utilities.ts";

const skill: Skill = {
	name: "context-debugging",
	description: "Measure the exact provider payload.",
	filePath: "/skills/context-debugging/SKILL.md",
	baseDir: "/skills/context-debugging",
	sourceInfo: {
		path: "/skills/context-debugging/SKILL.md",
		source: "test",
		scope: "temporary",
		origin: "top-level",
	},
	disableModelInvocation: false,
};

describe("provider context report", () => {
	test("captures the final provider payload without receiving a response", async () => {
		const extensionsResult = await createTestExtensionsResult([
			(pi) => {
				pi.registerTool({
					name: "inspect_context",
					label: "Inspect context",
					description: "Inspect the provider context.",
					parameters: Type.Object({}),
					execute: async () => ({ content: [], details: {} }),
				});
				pi.on("before_agent_start", (event) => {
					event.systemPromptOptions.sections.context_report = "Capture the final request.";
				});
				pi.on("before_provider_request", (event) => {
					if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
						throw new Error("Expected faux provider payload to be an object");
					}
					return { ...event.payload, captured: true };
				});
			},
		]);
		const resourceLoader = createTestResourceLoader({ extensionsResult });
		resourceLoader.getSkills = () => ({ skills: [skill], diagnostics: [] });
		const harness = await createHarness({ resourceLoader, initialActiveToolNames: ["read", "inspect_context"] });
		try {
			const report = await captureProviderContext(harness.session);
			expect(harness.getPendingResponseCount()).toBe(0);
			expect(report.systemPrompt).toContain("Capture the final request.");
			expect(report.skills).toEqual([{ name: "context-debugging", chars: 182 }]);
			expect(report.tools.map((tool) => tool.name)).toEqual(["read", "inspect_context"]);
			expect(report.payload).toMatchObject({ captured: true });
		} finally {
			harness.cleanup();
		}
	});

	test("formats a complete text and JSON report", () => {
		const report: ProviderContextReport = {
			model: { provider: "faux", id: "faux-model", api: "openai-responses" },
			payload: { instructions: "System", tools: [] },
			payloadChars: 36,
			systemPrompt: "System",
			systemPromptChars: 6,
			skills: [{ name: "context-debugging", chars: 42 }],
			tools: [{ name: "read", path: "$.tools[0]", chars: 71 }],
		};

		expect(formatProviderContextReport(report, false)).toBe(`Provider payload for faux/faux-model (openai-responses)
The payload row is the exact compact JSON request body captured after all hooks. Prompt, skill, and tool rows are inclusive components and do not sum to the payload total.
Token counts require a provider response and are intentionally not estimated.

type     name                       chars
----     ----                       -----
payload  complete provider request  36   
prompt   rendered system prompt     6    
skill    context-debugging          42   
tool     read                       71   

== rendered system prompt ==
System`);
		expect(formatProviderContextReport(report, true)).toBe(`{
  "model": {
    "provider": "faux",
    "id": "faux-model",
    "api": "openai-responses"
  },
  "payload": {
    "instructions": "System",
    "tools": []
  },
  "payloadChars": 36,
  "systemPrompt": "System",
  "systemPromptChars": 6,
  "skills": [
    {
      "name": "context-debugging",
      "chars": 42
    }
  ],
  "tools": [
    {
      "name": "read",
      "path": "$.tools[0]",
      "chars": 71
    }
  ]
}`);
	});
});
