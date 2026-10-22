---
name: extension-stored-data
description: Add, change, or remove anything the Bookmark Scout extension keeps in browser storage - a stored item or collection, a user setting (synced or per device), a dismissed notice, cross-tab session state, a cache - with the storage registry, zod parsing, the { v, data } envelope, Web Locks, backup policy, old-key cleanup, sync quota limits, the settings matrix, and the matching privacy disclosures. Use when touching src/lib/storage/, settings-schema.ts, settings-storage.ts, any *-storage.ts module, config/settings/*.toml, backup.ts, or when the user asks for a new setting, wants something remembered, synced, backed up, or reset.
---

# Extension stored data

Every stored value is an entry in `STORAGE_ITEMS` (`apps/extension/src/lib/storage/registry.ts`), and every setting is a field in `src/lib/settings-schema.ts` with its default in `config/settings/<tab>.toml`. The rules (key names, areas, `{ v, data }`, `update` under Web Locks, cleanup of unlisted keys, settings stored as overrides) are in "Config" and "Storage" under "Shared building blocks" in `apps/extension/AGENTS.md` and in the registry's header. Read both first; this skill is the order of work and the traps.

## Add a stored item

1. **Choose the area and say why** in the registry entry: `sync` only for small values the user expects on every device (8,192 bytes per item, 102,400 in total, never credentials); `local` for this device, caches, logs, and anything naming bookmark ids (ids differ per device); `session` for state shared by open pages until the browser closes (the manager's clipboard and undo history store ids and re-read them on use, skipping deleted ones).
2. **Key:** `<domain>.<name>` in kebab-case, `v: 1`, and a `backup` policy: `include`, `exclude` (device-bound, rebuildable, short-lived), or `secret` (never synced, never in a file). A field-level exception goes in the backup code: AI services are `secret` for keys and headers, but `aiEndpoints` keeps each Base URL in the backup (PR #644).
3. **Define it once** with `defineStoredValue(STORAGE_ITEMS.x, { schema | parse, empty })` in the module that owns it, and read it in React with `useStoredValue`. The zod schema lives in that module, not in the registry: the registry must stay importable in Node with no WXT auto-imports (E2E specs import it to name keys), and some schemas pull in code the background must not load.
4. **Collections** (`defineStoredCollection`, one item per id plus an index): write an entry before the index lists it and remove it after the index drops it; restore writes entries first and removals last; read with one batched `getMany`; remove orphans only after a grace period (`orphan_grace_hours` in `config/ai/prompt-library.toml`), because sync can deliver an entry before its index.
5. **Parse lists entry by entry** (`parseValidList`, `parseValidRecord` in `src/lib/storage/parse.ts`) so one malformed entry is dropped alone instead of emptying the collection. A value built from several items is a `defineDerivedValue`.
6. **Change it with `update`**, never by `set`ting a copy from an earlier read: `update` holds a Web Lock per key across pages and the background and re-reads inside it.
7. **Backup:** a new `include` item needs a source in `BACKUP_ITEMS` (`src/services/backup.ts`; `tests/unit/backup.test.ts` fails otherwise). Never key exported data by a field that is not unique: URL-keyed tags merged two bookmarks of one URL (PR #644).
8. **Disclose it** with the `privacy-disclosure-sync` skill: new synced or session items, and anything the backup or JSON export now holds, belong in `store/privacy-disclosures.md` and the policy (PRs #620, #622, #647).
9. **A new folder under `src/lib`** is not auto-imported: `imports.dirs` in `wxt.config.ts` lists `lib` and `lib/storage` separately. Add the folder there.

## Add a setting

1. Field in `settings-schema.ts`, default and bounds in the `config/settings/<tab>.toml` table of the Options section that shows it (`tests/unit/settings-config.test.ts` checks the placement).
2. **Size limits on every synced field** (`max_length`, `max_items`): `tests/unit/settings-storage.test.ts` fills every field to its largest with `<` (which Chrome stores as 6 bytes) and checks each synced settings item stays under 8,192 bytes: list settings (any setting whose default is a list) are stored in `sync:settings.lists` (scope `lists` in `getSettingScope`), the rest in `sync:settings`, which made room again when new scalar settings had filled it (2026-10-22). Lists an earlier release kept in `settings` still count, and the next save moves them. Restrict list entries to one-byte printable characters where you can, or the limit you can offer collapses. Free text that would not fit at its worst case gets its own synced item instead of a settings field: About me (`sync:ai.about-me`, 1,000 characters) would have left room for about 75 characters inside `settings` (PR #699).
3. **Device-only settings** go in `DEVICE_SETTING_KEYS` (`registry.ts`), which stores them in `local:settings`; do not give one its own `local:` item. `changeSettings` writes only keys whose value changed, taking the sync, lists, and device locks in that order, so keys a newer release wrote survive.
4. **The total sync budget** is tested in `tests/unit/prompt-library.test.ts`: the number of non-collection sync items times 8,192 plus the prompt budget must stay under 102,400. A new synced item fails it; lower `max_prompts` or `prompt_max_bytes` in the same PR, or keep the value in `settings`.
5. **Consumers:** map the setting to its consumer and test titles in `tests/settings-matrix.ts`, flip it in a test and assert the behavior changes, and make it apply live (see "Settings UX" in `extension-ui-change`).
6. **Removing a setting** touches the schema, the TOML, locale keys, the settings matrix, E2E seeds, and the docs settings pages in every language; a stale "AI Provider/AI Model" row survived one PR that way (PRs #614, #620).

## Traps

- **Saving from a closing page.** A save started while Options unloads never gets through the lock; Options hands its last edit to the background (`'settings/save'` in `settings-storage.ts`). In E2E, wait until the value is stored before reloading.
- **Drafts across tabs.** A field holding a local draft must not write an unchanged draft back on blur: the Base UI NumberField overwrote another tab's newer value (PR #643, `tests/e2e/options-safety.spec.ts`). Test two Options tabs once per new field type.
- **Flash on open.** A component that depends on a stored value renders nothing until `useStoredValue(...).isLoading` is false (dismissed notices, PR #618).
- **Dismissed notices** are ids in `local:ui.dismissed-notices` (`backup: 'exclude'`): a new dismissible notice is a new id, not a setting.
- **Lock tests in Node.** CI's Node had no `navigator.locks`, so a two-instance unit test silently fell back to per-page queues and failed only in CI. Stub one shared lock manager (`tests/unit/stored-value.test.ts`).
- **Test helpers only.** Seed and read through `tests/e2e/storage.ts` (`setSettings`, `readSettings`, `writeStored`, `readStored`, `seedAIServices`) or `tests/unit/storage-helpers.ts`. `readSettings` returns overrides, so a setting back at its default reads as `undefined`.
- **Raising `v`** needs a migration step in `defineStoredValue`; a unit test fails without one. A newer `v` than the release knows is read but never written.

## Dropping old data

Older releases' keys are removed on install and update, not migrated (maintainer decision for the storage redesign). Before a change that drops data store users have, list exactly what they lose and get the maintainer's explicit yes. Cleanup on update has no automated test, but it can be checked by hand: copy the build, seed unknown keys in a persistent profile, bump `version` in the copy's `manifest.json`, and relaunch the same profile (`extension-exploratory-qa`).
