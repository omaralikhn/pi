---
title: User-level model settings
tags:
  - model
  - settings
  - thinking
  - provider
  - defaults
  - configuration
  - persistence
  - reload
  - json
---

`model-settings.json` separates user model and thinking preferences from general Pi configuration under `packages/coding-agent`.

## Why

Pi users can change default models and thinking behavior without mixing those preferences with resources, UI configuration, or trusted project settings.

## State

* The **default file** is `~/.pi/agent/model-settings.json`.
* A custom **agent directory** places the file at `<PI_CODING_AGENT_DIR>/model-settings.json`.
* The **allowed fields** are `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `modelThinkingLevels`, `thinkingBudgets`, `enabledModels`, `hideThinkingBlock`, `showCacheMissNotices`, and `cacheWarming`.
* An **absent file** leaves every model preference at its existing built-in default and does not create a file.

## Behavior

* **Startup and reload** merge general global settings, trusted general project settings, and user model settings, with model settings applied last.
* **Project settings** cannot set or override a model-and-thinking preference.
* **Interactive changes** write only the changed model field to `model-settings.json` and preserve unrelated external edits to that file.
* **Legacy fields** in either `settings.json` are ignored and left untouched.

## Failure modes and diagnostics

* **Malformed JSON** records a model-scope settings error with the `model-settings.json` path.
* **Reload failure** keeps the previous valid in-memory model settings until the file is repaired and reloaded.
* **Write failure** records the existing settings error without writing general settings instead.

## Invariants

* **One source of truth** owns each documented model-and-thinking preference.
* **User scope** prevents a trusted project from changing a user's model defaults.
* **Independent files** prevent general-settings writes from modifying model preferences and model preference writes from modifying general settings.

## Modules

| Concern | Source |
| --- | --- |
| Model-field ownership, persistence, reload, and diagnostics | `packages/coding-agent/src/core/settings-manager.ts` |
| User configuration paths | `packages/coding-agent/docs/configuration.md` |
| User documentation | `packages/coding-agent/docs/configuration.md` and `packages/coding-agent/docs/settings.md` |
| Storage, fresh-file, malformed-file, and external-edit tests | `packages/coding-agent/test/settings-manager.test.ts` |
| In-memory and UTF-8 BOM regression tests | `packages/coding-agent/test/suite/regressions/3616-settings-inmemory-reload.test.ts` and `packages/coding-agent/test/suite/regressions/8337-utf8-bom-parsing.test.ts` |

## Rejected alternatives

* **Automatic migration** from `settings.json` was rejected because it would silently rewrite user configuration and preserve a second source of truth.
* **Project-level model settings** were rejected because model and thinking preferences are user-level only.

## Change guide

* Extend the **model settings field list** and its tests when Pi adds another documented model-and-thinking preference.
* Keep **configuration documentation** and model-default consumers aligned when a field changes ownership.
