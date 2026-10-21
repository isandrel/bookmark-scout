/**
 * The keys bound to the extension's commands (`lib/command-catalog.ts`), and the ways to change
 * them, which differ by browser:
 * - Firefox can set and reset a shortcut from code (`commands.update`, `commands.reset`), reports
 *   changes (`commands.onChanged`), and opens its own Manage Extension Shortcuts page
 *   (`commands.openShortcutSettings`, Firefox 137+).
 * - Chrome and Edge only read shortcuts (`commands.getAll`); the user changes them on the
 *   browser's shortcut page, which lists every extension.
 * Each capability is detected by the API's presence, not by browser name. No UI code here; the
 * React side is `hooks/use-command-shortcuts.ts`.
 */

/** Firefox's extra `commands` functions; Chrome's types do not have them. */
type EditableCommands = {
  update?: (detail: { name: string; shortcut?: string }) => Promise<void>;
  reset?: (name: string) => Promise<void>;
  openShortcutSettings?: () => Promise<void>;
  onChanged?: {
    addListener: (callback: (change: { name: string }) => void) => void;
    removeListener: (callback: (change: { name: string }) => void) => void;
  };
};

/** Element id of the Options shortcuts panel, the target of `openCommandShortcutsInOptions`. */
export const SHORTCUTS_PANEL_ID = 'quick-save-shortcuts';

/** Each command's keys, `''` when the browser left it without any. */
export type CommandShortcuts = Record<ExtensionCommand, string>;

function editableCommands(): EditableCommands | undefined {
  return browser.commands as EditableCommands | undefined;
}

/** The keys bound to each extension command now. */
export async function getCommandShortcuts(): Promise<CommandShortcuts> {
  const commands = (await browser.commands?.getAll()) ?? [];
  const bound = new Map(commands.map((command) => [command.name, command.shortcut ?? '']));
  return Object.fromEntries(
    (Object.keys(EXTENSION_COMMANDS) as ExtensionCommand[]).map((name) => [
      name,
      bound.get(name) ?? '',
    ]),
  ) as CommandShortcuts;
}

/** Whether this browser lets the extension set shortcuts itself (Firefox). */
export function canEditCommandShortcuts(): boolean {
  const commands = editableCommands();
  return typeof commands?.update === 'function' && typeof commands.reset === 'function';
}

/** Binds `shortcut` (already checked by `isValidCommandShortcut`) to the command. */
export async function updateCommandShortcut(
  name: ExtensionCommand,
  shortcut: string,
): Promise<void> {
  const update = editableCommands()?.update;
  if (!update) throw new Error('commands.update is not available');
  await update({ name, shortcut });
}

/** Restores the command's suggested keys from the manifest. */
export async function resetCommandShortcut(name: ExtensionCommand): Promise<void> {
  const reset = editableCommands()?.reset;
  if (!reset) throw new Error('commands.reset is not available');
  await reset(name);
}

/** Calls back when a shortcut changes, where the browser reports it (Firefox 115+). */
export function watchCommandShortcuts(callback: () => void): () => void {
  const onChanged = editableCommands()?.onChanged;
  if (!onChanged) return () => {};
  const listener = () => callback();
  onChanged.addListener(listener);
  return () => onChanged.removeListener(listener);
}

/**
 * The browser's own bookmark keys and the command that can take them over, where the user can do
 * that on the browser's shortcut page (Chrome, Edge); `null` elsewhere. See `command-catalog.ts`.
 */
export function getBookmarkShortcutTakeover(): typeof BOOKMARK_SHORTCUT_TAKEOVER | null {
  const browsers: readonly SupportedBrowser[] = BOOKMARK_SHORTCUT_TAKEOVER.browsers;
  return browsers.includes(currentBrowser()) ? BOOKMARK_SHORTCUT_TAKEOVER : null;
}

/** Whether this browser runs its own action for `shortcut`, so an extension never receives it. */
export function isShortcutKeptByBrowser(shortcut: string, apple = isApplePlatform()): boolean {
  return (BROWSER_KEPT_SHORTCUTS[currentBrowser()] ?? []).some((kept) =>
    isSameCommandShortcut(kept, shortcut, { apple }),
  );
}

/** Whether the browser has a shortcut settings page this extension can open. */
export function canOpenBrowserShortcutSettings(): boolean {
  return (
    browserProfile().shortcutSettingsUrl !== null ||
    typeof editableCommands()?.openShortcutSettings === 'function'
  );
}

/** Opens the browser's own shortcut settings: Firefox's API, or Chromium's shortcut page. */
export async function openBrowserShortcutSettings(): Promise<void> {
  const openShortcutSettings = editableCommands()?.openShortcutSettings;
  if (typeof openShortcutSettings === 'function') {
    await openShortcutSettings();
    return;
  }
  const url = browserProfile().shortcutSettingsUrl;
  if (url) await browser.tabs.create({ url, active: true });
}

/** Opens Options on the category that holds the shortcuts panel, scrolled to the panel. */
export async function openCommandShortcutsInOptions(): Promise<void> {
  const category = Object.entries(getSettingsCategories()).find(([, meta]) =>
    meta.sections.some((section) => section.panel === 'shortcuts'),
  )?.[0];
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  await browser.tabs.create({
    url: browser.runtime.getURL(`/options.html${query}#${SHORTCUTS_PANEL_ID}`),
    active: true,
  });
}

/**
 * Takes the user to where they can set a shortcut: the Options recorder where the extension can
 * set shortcuts itself, otherwise the browser's shortcut settings.
 */
export async function openCommandShortcutSetup(): Promise<void> {
  if (canEditCommandShortcuts()) await openCommandShortcutsInOptions();
  else await openBrowserShortcutSettings();
}
