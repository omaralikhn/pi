---
title: Native deferred tool cache preservation
tags:
  - anthropic
  - openai
  - deferred
  - tools
  - search
  - schema
  - cache
  - resume
  - transcript
---

## Purpose

Deferred tools must preserve the provider request prefix that prompt caching keys on. Pi records every discovered full schema in the transcript, restores it after resume, and replays provider-native discovery in transcript order.

## Concepts

* **Initial tools** are the schemas present before the first model request. They remain the top-level `tools` array for the complete session.
* **Deferred schema history** records complete schemas returned by successful `tool_search` calls.
* **Native discovery** is the paired OpenAI `tool_search_call` and `tool_search_output` input items that append schemas where discovery occurred.
* **Synthetic tool state** is Pi's generic `system.toolsAdded` and `system.toolsRemoved` mechanism. Native OpenAI discovery does not use it.
* **Inline Anthropic tools** are provider-native `tool_addition` and `tool_removal` system-content blocks.

## OpenAI Responses lifecycle

1. `tool_search` resolves a deferred tool and records its complete schema in the result details.
2. The adapter leaves top-level `tools` unchanged.
3. Immediately after the original `tool_search` function result, the adapter emits native `tool_search_call` and `tool_search_output` items containing the selected schema.
4. Later requests and resumed sessions reconstruct callable tools from initial schemas plus persisted search-result schemas, then replay every native discovery pair at its original transcript position.

This is additive. Resuming a session must not produce synthetic `system.toolsAdded` or `system.toolsRemoved` records, replace the top-level tool array, or rewrite a cached prefix.

## Anthropic Messages lifecycle

1. Pi retains the initial tool array, gives its last tool `cache_control`, and appends `__pi_deferred_placeholder__` with `defer_loading: true`.
2. Later schema changes replay as ordered `tool_addition` and `tool_removal` blocks under the `inline-tools-2026-09-15` beta.
3. Resumed sessions rebuild callable tools from the persisted history and replay the same inline blocks without generating restart-only changes.

Anthropic requires a non-deferred initial tool to anchor the placeholder. When every initial tool is deferred, Pi retains the full-current-tool-list fallback instead.

## Provider policy

* `openai-responses` always uses native deferred-tool search, independent of capability metadata.
* `anthropic-messages` always uses native inline tool changes when an initial non-deferred tool exists, independent of capability metadata.
* Other APIs retain capability-driven behavior.

The behavior is scoped by `model.api`, not a provider or model name. This prevents Azure and OpenAI-compatible APIs from receiving OpenAI Responses behavior merely because their metadata is similar.

## Source ownership

| Concern | Source module |
| --- | --- |
| Tool-result schema journal and synthetic-state suppression | `packages/agent/src/agent-loop.ts` |
| Deferred-schema restoration | `packages/ai/src/utils/transcript.ts` |
| OpenAI native replay | `packages/ai/src/api/openai-responses-shared.ts` |
| OpenAI API policy | `packages/ai/src/api/openai-responses.ts` |
| Anthropic inline policy | `packages/ai/src/api/anthropic-messages.ts` |
| Resume loadout restoration | `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/agent-session.ts` |

## Verification

* A native OpenAI tool-search result persists the full loaded schema without synthetic tool-state messages.
* OpenAI top-level `tools` contains only initial schemas, while discovered schemas appear in ordered native search items.
* Resuming restores discovered schemas into the executable coding-agent loadout before the first `declareToolChanges` comparison.
* Resuming adds no restart-only `toolsAdded` or `toolsRemoved` messages.
* Anthropic keeps initial tools plus the deferred placeholder and replays later schemas only as ordered inline changes.
* A placeholder-only Anthropic request is never sent.
* A non-OpenAI, non-Anthropic API retains its normal capability-based fallback.

Implemented in `ea7900ad3` on branch `toolcache`.

## Installed-build requirement

The global npm installation consumes `packages/coding-agent/dist`, not TypeScript source. After changing deferred-tool behavior, always rebuild before replacing the global package:

```sh
cd ~/pi
npm run build:offline
npm uninstall -g @earendil-works/pi-coding-agent
npm install -g --ignore-scripts ~/pi/packages/coding-agent
/opt/homebrew/bin/pi --version
```

A same-version `npm install -g` may report `up to date` and retain stale build output. Uninstall first so the rebuilt bundle is copied.

## Live confirmation

Use isolated session directories and an exact deferred-tool name such as `ship`:

```sh
session_dir="$TMPDIR/pi-deferred-openai"
mkdir -p "$session_dir"
pi --provider openai --model gpt-5.4 --session-dir "$session_dir" \
  -p 'Use tool_search with the exact query ship. Do not invoke ship.'

session_dir="$TMPDIR/pi-deferred-anthropic"
mkdir -p "$session_dir"
pi --provider anthropic --model claude-sonnet-5-5 --session-dir "$session_dir" \
  -p 'Use tool_search with the exact query ship. Do not invoke ship.'
```

Confirm each session JSONL has a successful `tool_search` result whose `details.loadedTools` entry contains the complete `name`, `description`, and `parameters` schema. Then resume the same session with `pi --session <session.jsonl> -p '<follow-up>'` and inspect the resulting JSONL for `toolsAdded`, `toolsRemoved`, `tool_search_call`, `tool_search_output`, `tool_addition`, `tool_removal`, `cacheRead`, and `cacheWrite`.

## Latest verification

Pi 2.0.0 was rebuilt from this checkout, replaced with a clean global npm installation, and tested with fresh then resumed isolated sessions:

* **OpenAI Responses:** [`2026-10-05T01-50-12-896Z_01a109c1-1ba0-74ac-aa4a-d7438043f745.jsonl`](/var/folders/_t/376bsmqx6gjdtm8pntgq6_l00000gn/T/pi-deferred-openai-final.DBmfkx/2026-10-05T01-50-12-896Z_01a109c1-1ba0-74ac-aa4a-d7438043f745.jsonl) persisted the full `ship` schema. Resume created no tool-state messages, retained `ship`, read 7,680 cached tokens, and wrote no cache tokens.
* **Anthropic Messages:** [`2026-10-05T01-50-25-128Z_01a109c1-4b67-732c-958d-ddf9c9fb51bb.jsonl`](/var/folders/_t/376bsmqx6gjdtm8pntgq6_l00000gn/T/pi-deferred-anthropic-final.kN32h5/2026-10-05T01-50-25-128Z_01a109c1-4b67-732c-958d-ddf9c9fb51bb.jsonl) persisted the full `ship` schema. Resume created no tool-state messages, retained `ship`, read 21,351 cached tokens, and wrote a 99-token suffix for the new follow-up.

The coding-agent regression test restores a persisted native search result, executes the restored deferred tool, and proves the resumed Anthropic transcript gains neither a removal nor an addition. Adapter tests cover OpenAI native replay ordering, OpenAI synthetic-state suppression, and Anthropic ordered inline changes.
