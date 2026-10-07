---
title: tool_search single-tool loading
tags:
  - tool_search
  - deferred
  - tools
  - search
  - schema
  - mcp
---

`tool_search` loads one deferred tool by exact name so the model can call it from its next request.

## Why

The model needs the full schema of a deferred tool before it can call it, and the provider request already carries that schema once the tool is active. Returning a name and description in the result duplicates tokens, and a result limit has no effect when only an exact name matches.

## Behavior

* **Input** is a single `query` string, the exact name of the deferred tool. There is no `limit` argument.
* **Match** is the first searchable (`codemode` or `deferred` exposure) inactive tool whose name equals the trimmed query, so at most one tool loads.
* **Result text** is `Loaded <name>. It is available from your next call.` or `No matching tools found.` and carries no tool description.
* **Details** keep `loaded` and `loadedTools`, because native deferred-tool replay restores schemas from them (see `native-deferred-tool-cache.md`).
* **Description** lists every registered deferred tool by exact name and is refreshed only when the registry changes, never when a tool loads.

## Source ownership

| Concern | Source |
| --- | --- |
| Schema, description, `searchAndLoad`, execute | `packages/coding-agent/src/extensions/tool-search/tool.ts` |
| Tests | `packages/coding-agent/test/tool-search.test.ts` |

`DEFAULT_TOOL_SEARCH_LIMIT` and `Bm25Ranker` remain because codemode's `searchTools()` in `packages/coding-agent/src/extensions/codemode/execute.ts` still ranks with a limit.
