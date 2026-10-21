/**
 * The keyboard commands the extension registers with the browser (`manifest.commands`). The keys
 * each one suggests are in `config/ui/shortcuts.toml` (`[commands]`), with the browser's own keys
 * (`[browser]`). Users rebind them in the browser (chrome://extensions/shortcuts,
 * edge://extensions/shortcuts, or Firefox's Manage Extension Shortcuts); Options shows the
 * current keys from `commands.getAll()`.
 *
 * Pure data, like `permission-catalog.ts`: `manifest.config.ts` reads it outside the extension.
 *
 * Suggested keys avoid every built-in shortcut of Chrome, Edge, and Firefox on Windows, Linux, and
 * macOS (checked 2026-10-10): Alt+Shift+A, B, I, N, and T are taken (inactive dialogs, bookmarks
 * or favorites bar, feedback, split view, toolbar focus). On macOS, Alt is Option. Chrome allows at
 * most four suggested keys per extension, and leaves a key unassigned when another extension
 * already uses it.
 *
 * No browser lets an extension suggest its own bookmark keys (Ctrl+D, Command+D on macOS; checked
 * 2026-10-11 in Chrome 153 and Firefox 157). Chrome and Edge leave any suggested key that is a
 * browser shortcut unassigned (`CommandService::CanAutoAssign`); the `chrome_ui_overrides`
 * exception for the bookmark key was removed in Chrome 83. A key the user sets on the browser's
 * shortcut page is not checked that way, and extension keys run before the browser's own, so
 * there the user can give the bookmark key to quick save (`BOOKMARK_SHORTCUT_TAKEOVER` in
 * `keyboard-shortcuts.ts`). Firefox runs its own shortcuts first: `commands.update` accepts the
 * bookmark keys, but they still bookmark the page and never reach the extension
 * (`BROWSER_KEPT_SHORTCUTS`).
 */

import type { SupportedBrowser } from './supported-browsers';

export type QuickSaveMode = 'local' | 'ai';

export const EXTENSION_COMMANDS = {
  'quick-save': {
    mode: 'local',
    descriptionKey: 'command_quickSave',
  },
  'ai-quick-save': {
    mode: 'ai',
    descriptionKey: 'command_aiQuickSave',
  },
} as const satisfies Record<string, { mode: QuickSaveMode; descriptionKey: string }>;

export type ExtensionCommand = keyof typeof EXTENSION_COMMANDS;

/** The browser's keys (`[browser]` in shortcuts.toml) the extension acts on. */
export type BrowserKeyName = 'bookmarkPage' | 'bookmarkAllTabs';

/**
 * The browser's own "bookmark this page" key (`Ctrl` is Command on macOS), which the user can give
 * to `command` on the shortcut page of the listed browsers; Options and the popup offer it there.
 */
export const BOOKMARK_SHORTCUT_TAKEOVER_RULE = {
  key: 'bookmarkPage',
  command: 'quick-save',
  browsers: ['chrome', 'edge'],
} as const satisfies {
  key: BrowserKeyName;
  command: ExtensionCommand;
  browsers: readonly SupportedBrowser[];
};

/**
 * Browser keys a browser handles before any extension sees them, although it lets an extension
 * assign them, so the Options recorder refuses them. Firefox: bookmark this page and bookmark all
 * tabs.
 */
export const BROWSER_KEPT_KEY_NAMES: Readonly<
  Partial<Record<SupportedBrowser, readonly BrowserKeyName[]>>
> = {
  firefox: ['bookmarkPage', 'bookmarkAllTabs'],
};

export function isExtensionCommand(name: string): name is ExtensionCommand {
  return Object.hasOwn(EXTENSION_COMMANDS, name);
}

/** The manifest's `commands`, with the suggested keys from config and localized descriptions. */
export function getManifestCommands(
  suggestedKeys: Readonly<Record<string, string>>,
): Record<string, { suggested_key: { default: string }; description: string }> {
  return Object.fromEntries(
    Object.entries(EXTENSION_COMMANDS).map(([name, command]) => {
      const key = suggestedKeys[name];
      if (!key) throw new Error(`config/ui/shortcuts.toml [commands] has no keys for "${name}"`);
      return [
        name,
        { suggested_key: { default: key }, description: `__MSG_${command.descriptionKey}__` },
      ];
    }),
  );
}
