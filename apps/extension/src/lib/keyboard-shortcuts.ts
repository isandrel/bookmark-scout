/**
 * Key matching and guards shared by the popup and manager keyboard shortcuts.
 *
 * Shortcuts never use Ctrl or Cmd, so browser-reserved combinations (Ctrl/Cmd+L, T, W, N, R, D,
 * and so on) always reach the browser. They are also ignored while the user types, while an
 * IME composition is in progress, and while a dialog or menu owns the keyboard.
 */

/** The parts of a keyboard event the guards read, so they can be tested without a DOM. */
export type ShortcutKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  target?: EventTarget | null;
};

export type ShortcutBinding = {
  /** `KeyboardEvent.key`, for example `'/'`, `'?'`, `'j'`, `'ArrowUp'`, or `'Backspace'`. */
  key: string;
  alt?: boolean;
  /** Required Shift state. Ignored for punctuation, whose Shift state depends on the layout. */
  shift?: boolean;
};

export type ShortcutGuardOptions = {
  /** Handle the key even when it comes from a text field (used for Escape). */
  allowWhileTyping?: boolean;
  /** Handle the key even while a dialog, menu, or listbox is open (used for Escape). */
  allowWithOverlay?: boolean;
  /** Document to check for open overlays; defaults to the global document when there is one. */
  root?: Pick<Document, 'querySelector'> | null;
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

// Radix mounts dialogs, popovers (role dialog), menus, and select lists only while they are open.
const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
].join(',');

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
  // Chrome reports keyCode 229 for the keydown that ends a composition.
  return event.isComposing === true || event.keyCode === 229;
}

/** Ctrl and Cmd combinations belong to the browser and the operating system. */
export function isBrowserReservedCombo(event: ShortcutKeyEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

/** True while a dialog, menu, popover, or open select has the keyboard. */
export function hasOpenOverlay(root?: Pick<Document, 'querySelector'> | null): boolean {
  const doc = root ?? (typeof document === 'undefined' ? null : document);
  return Boolean(doc?.querySelector(OVERLAY_SELECTOR));
}

const isPunctuationKey = (key: string) => key.length === 1 && !/[\p{L}\p{N}\s]/u.test(key);

/** Exact key and modifier match. Ctrl and Cmd never match, so no browser combo is taken. */
export function matchesShortcut(event: ShortcutKeyEvent, binding: ShortcutBinding): boolean {
  if (isBrowserReservedCombo(event)) return false;
  if (event.altKey !== (binding.alt ?? false)) return false;
  if (!isPunctuationKey(binding.key) && event.shiftKey !== (binding.shift ?? false)) return false;
  // Letters compare exactly, so Shift+J (`J`) does not match `j`.
  return event.key === binding.key;
}

/** Whether a shortcut may act on this event at all. */
export function canHandleShortcut(
  event: ShortcutKeyEvent,
  { allowWhileTyping = false, allowWithOverlay = false, root }: ShortcutGuardOptions = {},
): boolean {
  if (event.defaultPrevented) return false;
  if (isComposingEvent(event)) return false;
  if (isBrowserReservedCombo(event)) return false;
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
