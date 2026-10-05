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

## Verification

* A native OpenAI tool-search result persists the full loaded schema without synthetic tool-state messages.
* OpenAI top-level `tools` contains only initial schemas, while discovered schemas appear in ordered native search items.
* Resuming restores callable schemas and replays unchanged discovery history.
* Anthropic keeps initial tools plus the deferred placeholder and replays later schemas only as ordered inline changes.
* A placeholder-only Anthropic request is never sent.
* A non-OpenAI, non-Anthropic API retains its normal capability-based fallback.

Implemented in `ea7900ad3` on branch `toolcache`.
