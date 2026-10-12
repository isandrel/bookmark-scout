/**
 * The keyboard commands the extension registers with the browser (`manifest.commands`), with the
 * keys it suggests. Users rebind them in the browser (chrome://extensions/shortcuts,
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
 * there the user can give Ctrl+D to quick save (`BOOKMARK_SHORTCUT_TAKEOVER`). Firefox runs its
 * own shortcuts first: `commands.update` accepts Ctrl+D, but the key still bookmarks the page and
 * never reaches the extension (`BROWSER_KEPT_SHORTCUTS`).
 */

import type { PermissionBrowser } from './permission-catalog';

export type QuickSaveMode = 'local' | 'ai';

export const EXTENSION_COMMANDS = {
  'quick-save': {
    mode: 'local',
    suggestedKey: 'Alt+Shift+S',
    descriptionKey: 'command_quickSave',
  },
  'ai-quick-save': {
    mode: 'ai',
    suggestedKey: 'Alt+Shift+D',
    descriptionKey: 'command_aiQuickSave',
  },
} as const satisfies Record<
  string,
  { mode: QuickSaveMode; suggestedKey: string; descriptionKey: string }
>;

export type ExtensionCommand = keyof typeof EXTENSION_COMMANDS;

/**
 * The browser's own "bookmark this page" keys (`Ctrl` is Command on macOS), which the user can give
 * to `command` on the shortcut page of the listed browsers; Options and the popup offer it there.
 */
export const BOOKMARK_SHORTCUT_TAKEOVER = {
  shortcut: 'Ctrl+D',
  command: 'quick-save',
  browsers: ['chrome', 'edge'],
} as const satisfies {
  shortcut: string;
  command: ExtensionCommand;
  browsers: readonly PermissionBrowser[];
};

/**
 * Keys a browser handles before any extension sees them, although it lets an extension assign
 * them, so the Options recorder refuses them. Firefox: bookmark this page and bookmark all tabs.
 */
export const BROWSER_KEPT_SHORTCUTS: Readonly<
  Partial<Record<PermissionBrowser, readonly string[]>>
> = {
  firefox: ['Ctrl+D', 'Ctrl+Shift+D'],
};

export function isExtensionCommand(name: string): name is ExtensionCommand {
  return Object.hasOwn(EXTENSION_COMMANDS, name);
}

/** The manifest's `commands`, with localized descriptions. */
export function getManifestCommands(): Record<
  string,
  { suggested_key: { default: string }; description: string }
> {
  return Object.fromEntries(
    Object.entries(EXTENSION_COMMANDS).map(([name, command]) => [
      name,
      {
        suggested_key: { default: command.suggestedKey },
        description: `__MSG_${command.descriptionKey}__`,
      },
    ]),
  );
}
