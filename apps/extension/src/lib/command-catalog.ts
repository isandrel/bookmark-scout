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
 */

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
