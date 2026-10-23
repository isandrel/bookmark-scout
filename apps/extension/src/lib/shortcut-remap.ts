/**
 * Changing the in-page shortcuts (config/ui/shortcuts.toml, `[manager]` and `[popup]`) in Options >
 * Behavior > Manager and popup shortcuts: which shortcuts can change, how a key press becomes a
 * binding, which keys a shortcut may take, and which other shortcut already has them. The rules
 * are config/ui/shortcut-remap.toml; the user's keys are the `pageShortcutOverrides` setting,
 * which `getPageShortcutBindings` (src/lib/keyboard-shortcuts.ts) merges over the configured ones.
 *
 * The browser's commands are not here: the browser owns their keys (`ShortcutsPanel`).
 */
import { z } from 'zod';

const pageShortcutIdSchema = z.enum(PAGE_SHORTCUT_IDS as [PageShortcutId, ...PageShortcutId[]]);

const remapConfig = readConfig(
  'ui/shortcut-remap',
  z.strictObject({
    fixed: z.array(pageShortcutIdSchema),
    mod_sections: z.array(z.enum(['manager', 'popup'])),
    while_typing: z.array(pageShortcutIdSchema),
    groups: z.partialRecord(pageShortcutIdSchema, z.string().min(1)),
    reserved: z.strictObject({
      patterns: z.array(shortcutBindingSchema).min(1),
      browser: z.array(shortcutBindingSchema).min(1),
    }),
  }),
);

const FIXED = new Set<PageShortcutId>(remapConfig.fixed);
const MOD_SECTIONS = new Set<PageShortcutSection>(remapConfig.mod_sections);
const WHILE_TYPING = new Set<PageShortcutId>(remapConfig.while_typing);
const RESERVED: readonly ShortcutBinding[] = [
  ...remapConfig.reserved.patterns,
  ...remapConfig.reserved.browser,
];

/** The shortcuts the user can change, in the order of config/ui/shortcuts.toml. */
export const REMAPPABLE_SHORTCUT_IDS: readonly PageShortcutId[] = PAGE_SHORTCUT_IDS.filter(
  (id) => !FIXED.has(id),
);

/** What Options calls each shortcut; the manager's help names most of them the same way. */
export const PAGE_SHORTCUT_LABEL_KEYS = {
  'manager.focus_filter': 'managerDefaults_focusSearch',
  'manager.show_help': 'shortcuts_showHelp',
  'manager.parent_folder': 'shortcuts_parentFolder',
  'manager.next_row': 'shortcuts_nextRow',
  'manager.previous_row': 'shortcuts_previousRow',
  'manager.open_saved_searches': 'shortcuts_openSavedSearches',
  'manager.preview': 'shortcuts_preview',
  'manager.preview_previous': 'shortcuts_previewPrevious',
  'manager.preview_next': 'shortcuts_previewNext',
  'manager.select_all': 'shortcuts_selectAll',
  'manager.clear_selection': 'shortcuts_clearSelection',
  'manager.delete': 'shortcuts_deleteSelection',
  'manager.rename': 'shortcuts_rename',
  'manager.open': 'shortcuts_open',
  'manager.open_in_new_tabs': 'shortcuts_openInNewTabs',
  'manager.open_in_new_window': 'shortcuts_openInNewWindow',
  'manager.undo': 'shortcuts_undo',
  'manager.redo': 'shortcuts_redo',
  'manager.copy': 'shortcuts_copy',
  'manager.cut': 'shortcuts_cut',
  'manager.paste': 'shortcuts_paste',
  'popup.focus_search': 'managerDefaults_focusSearch',
  'popup.recent_searches': 'shortcuts_recentSearches',
} as const satisfies Record<PageShortcutId, MessageKey>;

/** The shortcuts no key may be shared with: those of one section, unless grouped apart. */
export function shortcutConflictGroup(id: PageShortcutId): string {
  return remapConfig.groups[id] ?? pageShortcutSection(id);
}

/**
 * One string per combination as `matchesShortcut` tells them apart: letters and digits typed with
 * Ctrl, Cmd, or Alt in either case are one key, and punctuation ignores Shift.
 */
export function bindingSignature(binding: ShortcutBinding): string {
  const positional = (binding.mod || binding.alt) && /^[a-z0-9]$/i.test(binding.key);
  const key = positional ? binding.key.toLowerCase() : binding.key;
  const shift = binding.shift === true && !isPunctuationKey(binding.key);
  return [binding.mod && 'mod', binding.alt && 'alt', shift && 'shift', key]
    .filter(Boolean)
    .join('+');
}

export function isSameBinding(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return bindingSignature(a) === bindingSignature(b);
}

const isSameBindings = (a: readonly ShortcutBinding[], b: readonly ShortcutBinding[]) =>
  a.length === b.length && a.every((binding, index) => isSameBinding(binding, b[index]));

// ---------------------------------------------------------------------------------------------
// Stored overrides

/**
 * The stored overrides (`pageShortcutOverrides`, whose schema checks each entry's shape and size)
 * that name a shortcut the user can change, with keys it may have: an unknown or fixed id (a
 * shortcut a later release dropped), or Ctrl or Cmd in the popup, is left out alone, so the others
 * keep working.
 */
export function parsePageShortcutOverrides(
  stored: Readonly<Record<string, readonly ShortcutBinding[]>>,
): PageShortcutOverrides {
  const remappable = new Set<string>(REMAPPABLE_SHORTCUT_IDS);
  return Object.fromEntries(
    Object.entries(stored).filter(
      ([id, bindings]) =>
        remappable.has(id) &&
        (MOD_SECTIONS.has(pageShortcutSection(id as PageShortcutId)) ||
          !bindings.some((binding) => binding.mod)),
    ),
  );
}

/**
 * `overrides` with `id` set to `bindings`, or without an entry for it when they are its
 * configured keys, so a shortcut back at its keys stores nothing.
 */
export function withPageShortcut(
  overrides: PageShortcutOverrides,
  id: PageShortcutId,
  bindings: readonly ShortcutBinding[],
  apple: boolean = isApplePlatform(),
): PageShortcutOverrides {
  const { [id]: _previous, ...rest } = overrides;
  const configured = getPageShortcutKeys(id, {}, apple);
  return isSameBindings(bindings, configured) ? rest : { ...rest, [id]: bindings };
}

/** `overrides` without an entry for `id`: the shortcut has its configured keys again. */
export function withoutPageShortcut(
  overrides: PageShortcutOverrides,
  id: PageShortcutId,
): PageShortcutOverrides {
  const { [id]: _previous, ...rest } = overrides;
  return rest;
}

// ---------------------------------------------------------------------------------------------
// Recording keys

/** Keys pressed on their own while building a combination, which wait for the key itself. */
const MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'FnLock',
  'Hyper',
  'Meta',
  'NumLock',
  'OS',
  'ScrollLock',
  'Shift',
  'Super',
  'Symbol',
  'SymbolLock',
]);

/** `KeyboardEvent.key` values that name no key a shortcut could match again. */
const UNUSABLE_KEYS = new Set(['Dead', 'Unidentified', 'Process', 'Compose']);

/** What a key press in the recorder gives. */
export type RecordedShortcutKeys =
  /** Only modifiers so far; the key is still to come. */
  | { status: 'pending' }
  | { status: 'invalid'; problem: 'unsupportedKey' | 'otherModifier' }
  | { status: 'recorded'; binding: ShortcutBinding };

/** The letter or digit a key's position (`KeyA`, `Digit1`) names, whatever the layout typed. */
function positionalCharacter(code: string | undefined): string | undefined {
  return /^(?:Key([A-Z])|Digit(\d))$/
    .exec(code ?? '')
    ?.slice(1)
    .find(Boolean)
    ?.toLowerCase();
}

/**
 * A key press as the binding `matchesShortcut` would answer: Ctrl (Cmd on a Mac) is `mod`, a
 * letter or digit typed with it or Alt is named by its position, a letter alone keeps its case
 * (Shift makes it a capital), and punctuation drops Shift. The other platform's modifier (Cmd on
 * Windows and Linux, Control on a Mac) is never matched, so it is refused.
 */
export function readShortcutKeys(
  event: ShortcutKeyEvent,
  apple: boolean = isApplePlatform(),
): RecordedShortcutKeys {
  if (MODIFIER_KEYS.has(event.key)) return { status: 'pending' };
  if (isComposingEvent(event) || UNUSABLE_KEYS.has(event.key)) {
    return { status: 'invalid', problem: 'unsupportedKey' };
  }
  if (apple ? event.ctrlKey : event.metaKey) return { status: 'invalid', problem: 'otherModifier' };
  const mod = apple ? event.metaKey : event.ctrlKey;
  const alt = event.altKey;
  const positional = mod || alt ? positionalCharacter(event.code) : undefined;
  let key = positional ?? event.key;
  if (!positional && /^[a-z]$/i.test(key)) {
    key = event.shiftKey ? key.toUpperCase() : key.toLowerCase();
  }
  const shift = event.shiftKey && !isPunctuationKey(key);
  return {
    status: 'recorded',
    binding: {
      key,
      ...(alt ? { alt: true } : {}),
      ...(shift ? { shift: true } : {}),
      ...(mod ? { mod: true } : {}),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Which keys a shortcut may take

export type ShortcutKeysProblem =
  /** Ctrl or Cmd in the popup and side panel, which leave those keys to the browser. */
  | { kind: 'noModifierHere' }
  /** A key that types text, for a shortcut that works while typing. */
  | { kind: 'needsNamedKey' }
  /** Keys the browser, the system, or the pages' lists and trees keep. */
  | { kind: 'reserved' }
  /** Keys another shortcut that can act at the same time already has. */
  | { kind: 'inUse'; by: PageShortcutId };

/** The other shortcut of `id`'s group that has `binding` now, if any. */
export function findConflictingShortcut(
  id: PageShortcutId,
  binding: ShortcutBinding,
  overrides: PageShortcutOverrides,
  apple: boolean = isApplePlatform(),
): PageShortcutId | undefined {
  const group = shortcutConflictGroup(id);
  return PAGE_SHORTCUT_IDS.find(
    (other) =>
      other !== id &&
      shortcutConflictGroup(other) === group &&
      getPageShortcutKeys(other, overrides, apple).some((taken) => isSameBinding(taken, binding)),
  );
}

/**
 * Why `id` may not have `binding`, or null when it may. A shortcut may always have its own
 * configured keys back (unless another shortcut took them meanwhile).
 */
export function checkShortcutKeys(
  id: PageShortcutId,
  binding: ShortcutBinding,
  overrides: PageShortcutOverrides,
  apple: boolean = isApplePlatform(),
): ShortcutKeysProblem | null {
  if (binding.mod && !MOD_SECTIONS.has(pageShortcutSection(id))) return { kind: 'noModifierHere' };
  if (WHILE_TYPING.has(id) && binding.key.length === 1) return { kind: 'needsNamedKey' };
  const configured = getPageShortcutKeys(id, {}, apple);
  const own = configured.some((entry) => isSameBinding(entry, binding));
  if (!own && RESERVED.some((entry) => isSameBinding(entry, binding))) return { kind: 'reserved' };
  const by = findConflictingShortcut(id, binding, overrides, apple);
  return by ? { kind: 'inUse', by } : null;
}

/** Why `id` cannot go back to its configured keys now, or null when it can. */
export function checkShortcutReset(
  id: PageShortcutId,
  overrides: PageShortcutOverrides,
  apple: boolean = isApplePlatform(),
): ShortcutKeysProblem | null {
  const rest = withoutPageShortcut(overrides, id);
  for (const binding of getPageShortcutKeys(id, {}, apple)) {
    const by = findConflictingShortcut(id, binding, rest, apple);
    if (by) return { kind: 'inUse', by };
  }
  return null;
}
