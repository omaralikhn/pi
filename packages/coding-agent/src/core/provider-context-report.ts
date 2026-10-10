import type { AgentSession } from "./agent-session.ts";

export interface ProviderContextReport {
	model: { provider: string; id: string; api: string };
	payload: unknown;
	payloadChars: number;
	systemPrompt: string;
	systemPromptChars: number;
	skills: ContextSkillReport[];
	tools: ContextToolReport[];
}

export interface ContextSkillReport {
	name: string;
	chars: number;
}

export interface ContextToolReport {
	name: string;
	path: string;
	chars: number;
}

class ProviderContextCapturedError extends Error {
	constructor() {
		super("Provider context captured");
	}
}

export async function captureProviderContext(session: AgentSession): Promise<ProviderContextReport> {
	const model = session.model;
	if (!model) throw new Error("Cannot capture provider context without a selected model");

	const originalOnPayload = session.agent.onPayload;
	let capturedPayload: unknown;
	let capturedSystemPrompt: string | undefined;
	let captured = false;
	session.agent.onPayload = async (payload, requestModel) => {
		const transformed = await originalOnPayload?.(payload, requestModel);
		capturedPayload = transformed === undefined ? payload : transformed;
		capturedSystemPrompt = session.systemPrompt;
		captured = true;
		throw new ProviderContextCapturedError();
	};

	try {
		await session.prompt("", { expandPromptTemplates: false });
	} finally {
		session.agent.onPayload = originalOnPayload;
	}

	if (!captured) throw new Error("Pi did not construct a provider payload");

	const systemPrompt = capturedSystemPrompt;
	if (systemPrompt === undefined) throw new Error("Pi did not render a system prompt");
	return {
		model: { provider: model.provider, id: model.id, api: model.api },
		payload: capturedPayload,
		payloadChars: stringify(capturedPayload).length,
		systemPrompt,
		systemPromptChars: systemPrompt.length,
		skills: findSkills(systemPrompt),
		tools: findTools(capturedPayload),
	};
}

export function formatProviderContextReport(report: ProviderContextReport, json: boolean): string {
	if (json) return JSON.stringify(report, null, 2);

	const rows = [
		["payload", "complete provider request", String(report.payloadChars)],
		["prompt", "rendered system prompt", String(report.systemPromptChars)],
		...report.skills.map((skill) => ["skill", skill.name, String(skill.chars)]),
		...report.tools.map((tool) => ["tool", tool.name, String(tool.chars)]),
	];
	const widths = ["type", "name", "chars"].map((heading, index) =>
		Math.max(heading.length, ...rows.map((row) => row[index]?.length ?? 0)),
	);
	const formatRow = (row: string[]) => row.map((value, index) => value.padEnd(widths[index]!)).join("  ");

	return [
		`Provider payload for ${report.model.provider}/${report.model.id} (${report.model.api})`,
		"The payload row is the exact compact JSON request body captured after all hooks. Prompt, skill, and tool rows are inclusive components and do not sum to the payload total.",
		"Token counts require a provider response and are intentionally not estimated.",
		"",
		formatRow(["type", "name", "chars"]),
		formatRow(["----", "----", "-----"]),
		...rows.map(formatRow),
		"",
		"== rendered system prompt ==",
		report.systemPrompt,
	].join("\n");
}

function findSkills(systemPrompt: string): ContextSkillReport[] {
	const catalog = systemPrompt.match(/<available_skills>\n([\s\S]*?)\n<\/available_skills>/)?.[1];
	if (!catalog) return [];

	return Array.from(catalog.matchAll(/ {2}<skill>\n {4}<name>(.*?)<\/name>[\s\S]*?\n {2}<\/skill>/g)).map((match) => ({
		name: decodeXml(match[1]!),
		chars: match[0].length,
	}));
}

function findTools(payload: unknown): ContextToolReport[] {
	const tools: ContextToolReport[] = [];
	const seen = new Set<object>();
	visitPayload(payload, "$", tools, seen);
	return tools;
}

function visitPayload(value: unknown, path: string, tools: ContextToolReport[], seen: Set<object>): void {
	if (!value || typeof value !== "object") return;
	if (seen.has(value)) return;
	seen.add(value);

	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			visitPayload(item, `${path}[${index}]`, tools, seen);
		}
		return;
	}

	for (const [key, child] of Object.entries(value)) {
		const childPath = `${path}.${key}`;
		if (key === "tools" && Array.isArray(child)) {
			child.forEach((tool, index) => {
				if (tool && typeof tool === "object" && !Array.isArray(tool)) {
					const name = typeof tool.name === "string" ? tool.name : `${childPath}[${index}]`;
					tools.push({ name, path: `${childPath}[${index}]`, chars: stringify(tool).length });
				}
			});
		}
		visitPayload(child, childPath, tools, seen);
	}
}

function stringify(value: unknown): string {
	const json = JSON.stringify(value);
	if (json === undefined) throw new Error("Provider payload is not JSON serializable");
	return json;
}

function decodeXml(value: string): string {
	return value
		.replaceAll("&apos;", "'")
		.replaceAll("&quot;", '"')
		.replaceAll("&gt;", ">")
		.replaceAll("&lt;", "<")
		.replaceAll("&amp;", "&");
}
