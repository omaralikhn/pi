/**
 * The `tool_search` tool as an extension. The CLI loads it as a built-in extension; SDK users add
 * `createToolSearchExtension()` to their extension factories.
 *
 * `tool_search` is registered inactive. Activate it with `--tools`, the `defaultTools` setting, or
 * `setActiveTools()`.
 */

import type { ExtensionFactory } from "../../core/extensions/types.ts";
import { createToolSearchDescription, createToolSearchToolDefinition, TOOL_SEARCH_DESCRIPTION } from "./tool.ts";

export function createToolSearchExtension(): ExtensionFactory {
	return (pi) => {
		let description = TOOL_SEARCH_DESCRIPTION;
		const registerTool = () => {
			pi.registerTool({ ...createToolSearchToolDefinition({ tools: pi, description }), defaultActive: false });
		};
		registerTool();
		pi.on("before_agent_start", () => {
			const nextDescription = createToolSearchDescription(pi.getAllTools());
			if (nextDescription === description) return;
			description = nextDescription;
			registerTool();
		});
	};
}

export default createToolSearchExtension();
