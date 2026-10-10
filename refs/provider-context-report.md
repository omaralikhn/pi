---
title: Initial provider context report
tags:
  - context
  - provider
  - payload
  - prompt
  - skills
  - tools
  - diagnostics
  - characters
  - hooks
  - cli
---

`pi context` captures the initial provider request assembled from the current project and user configuration.

## Why

A prompt file, skill catalog, and tool schema can each change during extension startup. Measuring files or a copied tool snapshot cannot show the request a provider actually receives.

## Behavior

* The **`context` command** converts to `--context`, forces an in-memory session, and otherwise uses normal CLI model, project, extension, tool, and resource configuration.
* `captureProviderContext()` sends an **empty user message** through the normal `AgentSession.prompt()` path.
* The capture wrapper runs after existing `before_provider_request` transformations, stores the final provider payload, and throws before adapter code reaches its HTTP transport.
* The command reports the exact **compact JSON character count** of that payload, the rendered system prompt, its visible skill entries, and tool objects found under `tools` arrays in the final payload.
* The text report labels prompt, skill, and tool counts as **inclusive** values. They must not be added to the payload total.
* `--mode json` prints the payload and metadata for provider-specific inspection.

## Invariants

* The command **does not create a persistent session**.
* The command **does not send a provider request** or receive provider usage data.
* All `before_agent_start` and `before_provider_request` hooks run, so their prompt, tool, and payload mutations are represented.
* The report does not present character counts as **token counts**.

## Modules

| Concern | Source |
| --- | --- |
| CLI routing and output | `packages/coding-agent/src/main.ts`, `src/cli/args.ts` |
| Payload capture and formatting | `packages/coding-agent/src/core/provider-context-report.ts` |
| Faux-provider callback contract | `packages/ai/src/providers/faux.ts` |
| Coverage | `packages/coding-agent/test/provider-context-report.test.ts`, `test/args.test.ts` |

## Limits

* The request payload excludes transport headers and authentication credentials because provider adapters add them outside the request body.
* Provider-reported input and cache tokens exist only after a real provider response. `pi context` intentionally stops before that response.
