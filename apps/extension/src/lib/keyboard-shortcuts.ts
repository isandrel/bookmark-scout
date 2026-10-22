/**
 * Key matching and guards shared by the popup and manager keyboard shortcuts, and the bindings
 * from config/ui/shortcuts.toml, the one place every shortcut is defined.
 *
 * Popup and side panel shortcuts never use Ctrl or Cmd, so browser-reserved combinations
 * (Ctrl/Cmd+L, T, W, N, R, D, and so on) always reach the browser. The manager page, which
 * replaces the browser's own manager, also binds the Ctrl (Cmd on Apple platforms) shortcuts of
 * that manager (select all, undo, redo, open in new tabs), marked `mod` in the config. Shortcuts
 * are ignored while the user types, while an IME composition is in progress, and while a dialog
 * or menu owns the keyboard.
 *
 * How keys are printed (key caps, Apple symbols, `aria-keyshortcuts`) lives in
 * `@bookmark-scout/config/shortcuts`, which the docs, website, and README use too.
 */

import {
  bindingKeyCaps,
  type ConfiguredBinding,
  ariaKeyShortcuts as configAriaKeyShortcuts,
  bindingsForPlatform as configBindingsForPlatform,
  isApplePlatform as configIsApplePlatform,
  type KeyBinding,
} from '@bookmark-scout/config/shortcuts';
import { z } from 'zod';

/** The parts of a keyboard event the guards read, so they can be tested without a DOM. */
export type ShortcutKeyEvent = {
  key: string;
  /** `KeyboardEvent.code`, which names a letter key on any layout (`KeyA`). */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  target?: EventTarget | null;
};

/** One key combination: `KeyboardEvent.key` plus Alt, Shift, and Ctrl (Cmd on a Mac). */
export type ShortcutBinding = KeyBinding;

const bindingFields = {
  key: z.string().min(1),
  alt: z.boolean().optional(),
  shift: z.boolean().optional(),
};

const bindingsSchema = z.array(z.strictObject(bindingFields)).min(1);

// The manager may use Ctrl/Cmd, and a binding may apply to one platform only.
const managerBindingsSchema = z
  .array(
    z.strictObject({
      ...bindingFields,
      mod: z.boolean().optional(),
      platform: z.enum(['mac', 'other']).optional(),
    }),
  )
  .min(1);

/** Keys in the browser's command format (`Alt+Shift+S`); `isValidCommandShortcut` checks them. */
const commandKeysSchema = z.string().refine(isValidCommandShortcut, {
  message: "must be keys in the browser's command format, such as Alt+Shift+S",
});

const shortcutsConfig = readConfig(
  'ui/shortcuts',
  z.strictObject({
    // Which platform's keys come first where text names both; the extension shows only the
    // reader's platform, so only the docs, website, and READMEs read it.
    display: z.strictObject({ primary: z.enum(['mac', 'other']) }),
    commands: z.strictObject({
      'quick-save': commandKeysSchema,
      'ai-quick-save': commandKeysSchema,
    }),
    // Browser keys the extension acts on; the others in the file are for the docs.
    browser: z
      .object({ bookmark_page: commandKeysSchema, bookmark_all_tabs: commandKeysSchema })
      .catchall(z.unknown()),
    manager: z.strictObject({
      focus_filter: managerBindingsSchema,
      show_help: managerBindingsSchema,
      parent_folder: managerBindingsSchema,
      next_row: managerBindingsSchema,
      previous_row: managerBindingsSchema,
      open_saved_searches: managerBindingsSchema,
      preview: managerBindingsSchema,
      select_all: managerBindingsSchema,
      clear_selection: managerBindingsSchema,
      delete: managerBindingsSchema,
      rename: managerBindingsSchema,
      open: managerBindingsSchema,
      open_in_new_tabs: managerBindingsSchema,
      open_in_new_window: managerBindingsSchema,
      undo: managerBindingsSchema,
      redo: managerBindingsSchema,
      copy: managerBindingsSchema,
      cut: managerBindingsSchema,
      paste: managerBindingsSchema,
    }),
    popup: z.strictObject({ focus_search: bindingsSchema, recent_searches: bindingsSchema }),
    // Mouse gestures, which the docs and website name; the manager selects as Chrome's does, and
    // @bookmark-scout/config validates them.
    mouse: z.record(z.string(), z.array(z.unknown()).min(1)),
  }),
);

/** macOS, iPadOS, and iOS, where key caps use Apple's symbols and Cmd stands in for Ctrl. */
export function isApplePlatform(): boolean {
  return configIsApplePlatform();
}

/** The configured bindings that apply on this platform, without the platform field. */
export function bindingsForPlatform(
  bindings: readonly ConfiguredBinding[],
  apple: boolean = isApplePlatform(),
): ShortcutBinding[] {
  return configBindingsForPlatform(bindings, apple);
}

const managerConfig = shortcutsConfig.manager;

/** Bindings per action, from config/ui/shortcuts.toml; the help dialog lists the same ones. */
export const SHORTCUT_BINDINGS = {
  manager: {
    focusFilter: bindingsForPlatform(managerConfig.focus_filter),
    showHelp: bindingsForPlatform(managerConfig.show_help),
    parentFolder: bindingsForPlatform(managerConfig.parent_folder),
    nextRow: bindingsForPlatform(managerConfig.next_row),
    previousRow: bindingsForPlatform(managerConfig.previous_row),
    openSavedSearches: bindingsForPlatform(managerConfig.open_saved_searches),
    preview: bindingsForPlatform(managerConfig.preview),
    selectAll: bindingsForPlatform(managerConfig.select_all),
    clearSelection: bindingsForPlatform(managerConfig.clear_selection),
    delete: bindingsForPlatform(managerConfig.delete),
    rename: bindingsForPlatform(managerConfig.rename),
    open: bindingsForPlatform(managerConfig.open),
    openInNewTabs: bindingsForPlatform(managerConfig.open_in_new_tabs),
    openInNewWindow: bindingsForPlatform(managerConfig.open_in_new_window),
    undo: bindingsForPlatform(managerConfig.undo),
    redo: bindingsForPlatform(managerConfig.redo),
  },
  /**
   * The browser's copy, cut, and paste keys. The manager acts on clipboard events, not on these
   * keys; they are listed so the shortcuts help names them.
   */
  managerClipboard: {
    copy: bindingsForPlatform(managerConfig.copy),
    cut: bindingsForPlatform(managerConfig.cut),
    paste: bindingsForPlatform(managerConfig.paste),
  },
  popup: {
    focusSearch: shortcutsConfig.popup.focus_search,
  },
  /** Opens the recent searches from the empty search box; once open, the arrows move in them. */
  popupSearchHistory: {
    open: shortcutsConfig.popup.recent_searches,
  },
} as const satisfies Record<string, Record<string, readonly ShortcutBinding[]>>;

/**
 * The keys each browser command suggests (`manifest.commands`), by command name, in the browser's
 * command format. The manifest build reads the same file through `readShortcutConfig`.
 */
export const COMMAND_SUGGESTED_KEYS: Readonly<Record<ExtensionCommand, string>> =
  shortcutsConfig.commands;

/** The browser's own keys the extension acts on, in the browser's command format. */
export const BROWSER_KEYS: Readonly<Record<BrowserKeyName, string>> = {
  bookmarkPage: shortcutsConfig.browser.bookmark_page,
  bookmarkAllTabs: shortcutsConfig.browser.bookmark_all_tabs,
};

/** The browser's bookmark key and the command the user can give it to, where they can. */
export const BOOKMARK_SHORTCUT_TAKEOVER = {
  shortcut: BROWSER_KEYS[BOOKMARK_SHORTCUT_TAKEOVER_RULE.key],
  command: BOOKMARK_SHORTCUT_TAKEOVER_RULE.command,
  browsers: BOOKMARK_SHORTCUT_TAKEOVER_RULE.browsers,
} as const;

/** Keys each browser keeps for itself although an extension may assign them. */
export const BROWSER_KEPT_SHORTCUTS: Readonly<
  Partial<Record<SupportedBrowser, readonly string[]>>
> = Object.fromEntries(
  Object.entries(BROWSER_KEPT_KEY_NAMES).map(([browser, names]) => [
    browser,
    names.map((name) => BROWSER_KEYS[name]),
  ]),
);

/**
 * Keys of the standard ARIA tree pattern, shared by the popup's tree and the manager's folder
 * tree; not configurable, so every tree in the extension answers the same keys.
 */
export const TREE_KEY_BINDINGS = {
  next: [{ key: 'ArrowDown' }],
  previous: [{ key: 'ArrowUp' }],
  first: [{ key: 'Home' }],
  last: [{ key: 'End' }],
  expand: [{ key: 'ArrowRight' }],
  collapse: [{ key: 'ArrowLeft' }],
  activate: [{ key: 'Enter' }],
  toggle: [{ key: ' ' }],
} as const satisfies Record<string, readonly ShortcutBinding[]>;

/**
 * The keys to press for `binding`, modifiers first, as the keyboard prints them: `['Alt', '↑']`,
 * or `['⌥', '↑']` on Apple platforms. Not translated.
 */
export function shortcutKeyCaps(binding: ShortcutBinding): string[] {
  return bindingKeyCaps(binding, isApplePlatform());
}

/** An `aria-keyshortcuts` value for the bindings, e.g. `Alt+ArrowUp Backspace`. */
export function ariaKeyShortcuts(bindings: readonly ShortcutBinding[]): string {
  return configAriaKeyShortcuts(bindings, isApplePlatform());
}

export type ShortcutGuardOptions = {
  /** Handle the key even when it comes from a text field (used for Escape). */
  allowWhileTyping?: boolean;
  /** Handle the key even while a dialog, menu, or listbox is open (used for Escape). */
  allowWithOverlay?: boolean;
  /** Let bindings with `mod` match Ctrl (Cmd) combinations; the manager page only. */
  allowModifiers?: boolean;
  /** Document to check for open overlays; defaults to the global document when there is one. */
  root?: OverlayRoot | null;
};

/** What `hasOpenOverlay` reads of a document, so it can be tested without a DOM. */
export type OverlayRoot = { querySelectorAll: (selectors: string) => ArrayLike<OverlayElement> };

/** The parts of an overlay element `hasOpenOverlay` reads; missing ones count as open. */
export type OverlayElement = {
  closest?: (selectors: string) => unknown;
  checkVisibility?: () => boolean;
};

// Inputs whose keys move a caret or pick a value; buttons, checkboxes, and radios are not typing.
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'reset',
  'submit',
]);
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/** keyCode of an IME's keydown; Chrome reports it for the keydown that ends a composition. */
const IME_PROCESS_KEY_CODE = 229;

// Dialogs, popovers (role dialog), menus, and select lists. Toasts would also match (Base UI gives
// them role dialog), so the Toast wrapper renders them as role status.
export const KEYBOARD_OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
].join(',');

// Base UI keeps some closed overlays in the page: a Select's list stays mounted inside a hidden,
// `data-closed` popup once it has been opened, and a closing dialog is marked `data-closed` until
// its animation ends. Those, and anything inert, no longer have the keyboard.
const CLOSED_OVERLAY_SELECTOR = '[hidden], [inert], [data-closed]';

/** Whether an overlay element is open: shown, and not inside a closed or inert container. */
function isOpenOverlay(element: OverlayElement): boolean {
  if (element.closest?.(CLOSED_OVERLAY_SELECTOR)) return false;
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

type ElementLike = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
};

/** True when keys typed at `target` edit text or pick a value, so shortcuts must stay out. */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as ElementLike;
  if (element.isContentEditable) return true;
  const tagName = element.tagName?.toUpperCase();
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has((element.type ?? 'text').toLowerCase());
  }
  const role = element.getAttribute?.('role');
  return role ? TEXT_ROLES.has(role) : false;
}

/** True while an IME is composing text; its Enter and arrows belong to the IME. */
export function isComposingEvent(event: ShortcutKeyEvent): boolean {
  return event.isComposing === true || event.keyCode === IME_PROCESS_KEY_CODE;
}

/** Ctrl and Cmd combinations belong to the browser and the operating system. */
export function isBrowserReservedCombo(event: ShortcutKeyEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

/** True while a dialog, menu, popover, or open select has the keyboard. */
export function hasOpenOverlay(root?: OverlayRoot | null): boolean {
  const doc: OverlayRoot | null = root ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return false;
  return Array.from(doc.querySelectorAll(KEYBOARD_OVERLAY_SELECTOR)).some(isOpenOverlay);
}

const isPunctuationKey = (key: string) => key.length === 1 && !/[\p{L}\p{N}\s]/u.test(key);

/**
 * Exact key and modifier match. Ctrl and Cmd match only a binding with `mod` (Ctrl, or Cmd on
 * Apple platforms; the other one never), so no other browser combination is taken.
 */
export function matchesShortcut(
  event: ShortcutKeyEvent,
  binding: ShortcutBinding,
  apple: boolean = isApplePlatform(),
): boolean {
  const mod = apple ? event.metaKey : event.ctrlKey;
  const otherMod = apple ? event.ctrlKey : event.metaKey;
  if (otherMod || mod !== (binding.mod ?? false)) return false;
  if (event.altKey !== (binding.alt ?? false)) return false;
  if (!isPunctuationKey(binding.key) && event.shiftKey !== (binding.shift ?? false)) return false;
  if (binding.mod && /^[a-z]$/i.test(binding.key)) {
    // With Ctrl or Cmd, `key` can be either case, or another script's letter; the key's position
    // (`code`) is what the browser's own shortcuts use.
    return (
      event.key.toLowerCase() === binding.key.toLowerCase() ||
      event.code === `Key${binding.key.toUpperCase()}`
    );
  }
  // Letters compare exactly, so Shift+J (`J`) does not match `j`.
  return event.key === binding.key;
}

/** Whether a shortcut may act on this event at all. */
export function canHandleShortcut(
  event: ShortcutKeyEvent,
  {
    allowWhileTyping = false,
    allowWithOverlay = false,
    allowModifiers = false,
    root,
  }: ShortcutGuardOptions = {},
): boolean {
  if (event.defaultPrevented) return false;
  if (isComposingEvent(event)) return false;
  if (!allowModifiers && isBrowserReservedCombo(event)) return false;
  if (!allowWhileTyping && isTypingTarget(event.target)) return false;
  if (!allowWithOverlay && hasOpenOverlay(root)) return false;
  return true;
}

/** The first binding the event matches, if the event may be handled. */
export function findShortcut<TAction extends string>(
  event: ShortcutKeyEvent,
  bindings: Readonly<Record<TAction, readonly ShortcutBinding[]>>,
  options?: ShortcutGuardOptions,
): TAction | null {
  if (!canHandleShortcut(event, options)) return null;
  for (const action of Object.keys(bindings) as TAction[]) {
    if (bindings[action].some((binding) => matchesShortcut(event, binding))) return action;
  }
  return null;
}
