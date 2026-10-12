---
name: extension-bookmark-actions
description: Add or change a bookmark action in the Bookmark Scout extension's action registry and surface it everywhere it belongs - the manager's right-click, ⋯, Organize, and empty-space menus, Ask AI tools and chat suggestion buttons, and the MCP bridge for local AI agents - with the right risk class, approval, undo history, permission, locale strings, Options settings (hide, reorder, AI permissions), and tests. Use when touching src/services/*-actions.ts, actions.ts, action-kit.ts, action-menus.ts, config/ui/actions.toml, config/ai/actions.toml, or when the user asks for a new menu command, a new thing Ask AI or agents can do, or a command that is missing from a surface.
---

# Extension bookmark actions

`ACTIONS` (`apps/extension/src/services/actions.ts`) is the one registry of things done to bookmarks. Menus, Ask AI, chat buttons, and the MCP bridge all derive their lists from it, so a capability is added once and tested once. The rules are in "Bookmark actions" and "Undo history" under "Shared building blocks" in `apps/extension/AGENTS.md`, and the header of `actions.ts`; read both first. This skill is the checklist and the traps.

## Add an action

1. **Pick the table by kind**, never a new list: `read-actions.ts` (lookups), `item-actions.ts` (menu commands on items or the folder shown), `write-actions.ts` (direct writes), `plan-actions.ts` (proposed bulk changes), `chat-actions.ts` (Ask AI suggestion buttons). Building blocks (`resolveActionFolder`, refs, paging) are in `action-kit.ts` and `action-library.ts`.
2. **Risk:** `read`, `write`, or `destructive`. It decides approval (`actionApproval`: destructive always, every write once page text or web results are in the conversation) and which Options lists the action appears in. Pass on a permission feature from `src/lib/permission-catalog.ts` when the action needs one.
3. **Call:** zod input and output schemas, `describe` (the step text, through `t()`), and `execute`. Return an `ActionError` (`{ error: { code, message, hint, candidates } }`) instead of throwing, so a model can recover. Name items by `b:<id>` / `f:<id>` and full path. Size limits go in `config/ai/actions.toml`.
4. **Agents:** add `agent` only when AI may call it; `agent.only` keeps it to one kind of agent (chat buttons are Ask AI only). Descriptions and errors meant for the model stay English on purpose (PR #627); only text the user sees goes through `t()`.
5. **Approval-gated calls get a `precheck`** (run by `checkActionCall`): a plan that is gone or out of date, a change already undone. Without it an agent waited up to five minutes on an approval window for a call that could never work, then heard "declined" (PR #639).
6. **Writes record undo.** Go through `recordBookmarkWrites` (or `ActionContext.writer` inside an approved plan), so each call is one Ctrl+Z step with a label that names the item. Never touch root, permanent, or managed folders (`unchangeableReason`). Moves go through `writer.moveBefore` / `moveBookmarkToPosition`: Chrome and Firefox count same-folder move indexes differently.
7. **Menus:** a label key (`actionName_*`, shown by the Options panels too), an `ActionIconName` mapped in `src/components/ui/table/action-icons.ts`, `itemMenu` or `folderMenu`, and the id in the right section of `config/ui/actions.toml` (`action-menus.ts` fails at load on an unknown id).
8. **Id length:** at most 20 characters. Users' hide lists and AI permission lists are synced settings capped at 16 ids × 20 characters to fit the 8 KB sync item; `tests/unit/action-menus.test.ts` checks every id.
9. **Locales:** every new string in every `public/_locales/*/messages.json`.
10. **Tests:** calls in `tests/unit/actions.test.ts`, menus in `tests/unit/action-menus.test.ts`, agent behavior with the scripted-model harness `tests/unit/agent-eval.ts` (include a refusal and a prompt-injection case), and an E2E spec for each surface that shows it.
11. **Docs:** if users see it, the docs page for that surface; if agents can call it, the local agents guide (`apps/docs/content/docs/guides/local-agents.mdx`).

## What the user controls

- Hiding and reordering item-menu actions: `managerMenuActions`, applied by `customizeItemMenu`, edited in `ManagerMenusPanel`. `[item_menu] keep_one_of` in `config/ui/actions.toml` names actions that must work for any single item; the panel refuses to hide the last of them, and an empty menu shows a disabled **No actions available** item (PR #641). A new action that should count must be available for any single item (the test checks it).
- What Ask AI may use: `askAiDisabledActions` (`AskAIActionsPanel`). What local agents may use: `agentBridgeDisabledActions` (`AgentBridgeActionsPanel`), plus `agentBridgeWrites` for any change. Both are checked in code by `agentActionIds` and `runAction`, never by prompt.

## Traps

- **The registry runs in the service worker.** The MCP bridge answers calls there, which cannot load code later, so every action module is in `background.js`: no React, icons as names, and no heavy imports. The background budget was raised from 305 to 395 KiB for the registry and JSON Schema conversion (PR #634); run `tests/e2e/startup-code.spec.ts` after adding imports (see `extension-performance`).
- **Every page that runs an action with `toast.withUndo` needs a toast region.** The popup's Ask AI view had none, so Save's undo toast never showed (PR #630).
- **Changing a button's text changes its accessible name.** Specs that match `name` with an anchored regex break; grep `tests/e2e` for the old label (PR #640).
- **Buttons from model output:** a save may name only a page the conversation knows (the current page, a `url` in a tool result, or a URL the user typed); the button text comes from the extension, not the model. See "Agent features" in `extension-ai-feature`.
- **Plans list each item once** (`withoutRepeats`), so the preview, `applied` count, and undo label agree; assert exact undo labels in tests, which is how a plan undo reading "Untitled" was found (PR #638).
- **Browser-specific labels:** the private-window command says incognito, InPrivate, or private window; Firefox offers it only when `extension.isAllowedIncognitoAccess()` is true (PR #623). Never type one browser's word in a spec.

## Not yet on the registry

The popup's rows and the quick save notification still have their own commands. Moving them is planned; when you touch them, prefer moving the command into the registry over adding another list.
