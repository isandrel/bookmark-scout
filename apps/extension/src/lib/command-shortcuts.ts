/**
 * Browser command shortcuts (`manifest.commands`): reading one from a key press, checking it
 * against the format the browser accepts, and turning a stored shortcut into key caps.
 *
 * The format is MDN's `commands` manifest key: a main modifier (Ctrl, Alt, Command, or MacCtrl),
 * an optional second modifier (Shift or another main one), then a key: A-Z, 0-9, F1-F19, Comma,
 * Period, Home, End, PageUp, PageDown, Space, Insert, Delete, Up, Down, Left, or Right. Function
 * keys need no modifier, and a media key stands alone. Firefox assigns F13-F19 only through
 * `commands.update`, which is how the Options recorder saves.
 *
 * Pure, with no browser APIs, so the rules are unit-tested directly.
 */

/** The parts of a keyboard event the recorder reads. */
export type CommandShortcutKeyEvent = {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

export type CommandShortcutProblem = 'needsModifier' | 'tooManyModifiers' | 'unsupportedKey';

export type CommandShortcutReading =
  /** Only modifiers are down so far; `keys` are the ones held. */
  | { status: 'pending'; keys: string[] }
  | { status: 'invalid'; problem: CommandShortcutProblem; keys: string[] }
  | { status: 'valid'; shortcut: string };

const MAIN_MODIFIERS = ['Ctrl', 'Alt', 'Command', 'MacCtrl'] as const;
const MAX_MODIFIERS = 2;
const NAMED_KEYS = [
  'Comma',
  'Period',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Space',
  'Insert',
  'Delete',
  'Up',
  'Down',
  'Left',
  'Right',
] as const;
const MEDIA_KEYS = ['MediaNextTrack', 'MediaPlayPause', 'MediaPrevTrack', 'MediaStop'] as const;

const FUNCTION_KEY = /^F(?:[1-9]|1[0-9])$/;
const KEY_PATTERN = new RegExp(`^(?:[A-Z]|[0-9]|F(?:[1-9]|1[0-9])|${NAMED_KEYS.join('|')})$`);
const MODIFIER_CODES = /^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$/;

/** `KeyboardEvent.code` (or `key`, for media keys) to the browser's media key names. */
const MEDIA_KEY_NAMES: Readonly<Record<string, (typeof MEDIA_KEYS)[number]>> = {
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPrevTrack',
  MediaPlayPause: 'MediaPlayPause',
  MediaStop: 'MediaStop',
};

/**
 * The browser's name for the pressed key, read from the physical key (`code`) so that Alt or
 * Option, which change the typed character, do not change the shortcut. Empty when unsupported.
 */
function commandKeyName(event: CommandShortcutKeyEvent): string {
  const { code } = event;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  const arrow = /^Arrow(Up|Down|Left|Right)$/.exec(code);
  if (arrow) return arrow[1];
  if (KEY_PATTERN.test(code)) return code;
  return MEDIA_KEY_NAMES[code] ?? MEDIA_KEY_NAMES[event.key] ?? '';
}

/**
 * The modifiers held, in the order the browser writes them. Apple keyboards have Command, Control
 * (`MacCtrl`), and Option (`Alt`); elsewhere Ctrl and Alt, and the Windows or Super key cannot be
 * part of a shortcut (`null`).
 */
function heldModifiers(event: CommandShortcutKeyEvent, apple: boolean): string[] | null {
  if (!apple && event.metaKey) return null;
  const held: [string, boolean][] = apple
    ? [
        ['MacCtrl', event.ctrlKey],
        ['Alt', event.altKey],
        ['Command', event.metaKey],
        ['Shift', event.shiftKey],
      ]
    : [
        ['Ctrl', event.ctrlKey],
        ['Alt', event.altKey],
        ['Shift', event.shiftKey],
      ];
  return held.filter(([, down]) => down).map(([name]) => name);
}

/** Reads a key press as a command shortcut, as the browser's own shortcut settings would. */
export function readCommandShortcut(
  event: CommandShortcutKeyEvent,
  { apple }: { apple: boolean },
): CommandShortcutReading {
  const modifiers = heldModifiers(event, apple);
  if (modifiers === null) return { status: 'invalid', problem: 'unsupportedKey', keys: [] };
  if (MODIFIER_CODES.test(event.code) || /^(?:Shift|Control|Alt|Meta|OS)$/.test(event.key)) {
    return { status: 'pending', keys: modifiers };
  }
  const key = commandKeyName(event);
  const keys = key ? [...modifiers, key] : modifiers;
  if (!key) return { status: 'invalid', problem: 'unsupportedKey', keys };
  const shortcut = keys.join('+');
  if (isValidCommandShortcut(shortcut)) return { status: 'valid', shortcut };
  if (modifiers.length > MAX_MODIFIERS)
    return { status: 'invalid', problem: 'tooManyModifiers', keys };
  if ((MEDIA_KEYS as readonly string[]).includes(key)) {
    return { status: 'invalid', problem: 'unsupportedKey', keys };
  }
  return { status: 'invalid', problem: 'needsModifier', keys };
}

/** Whether `shortcut` is in the format `commands.update` accepts (an empty one clears it). */
export function isValidCommandShortcut(shortcut: string): boolean {
  if ((MEDIA_KEYS as readonly string[]).includes(shortcut)) return true;
  const parts = shortcut.split('+');
  const key = parts.at(-1) ?? '';
  const modifiers = parts.slice(0, -1);
  if (!KEY_PATTERN.test(key)) return false;
  if (modifiers.length === 0) return FUNCTION_KEY.test(key);
  if (modifiers.length > MAX_MODIFIERS || new Set(modifiers).size !== modifiers.length) {
    return false;
  }
  const [main, second] = modifiers;
  const isMain = (name: string | undefined) =>
    (MAIN_MODIFIERS as readonly string[]).includes(name ?? '');
  return isMain(main) && (second === undefined || second === 'Shift' || isMain(second));
}

/** Apple keyboards print symbols for modifiers, as macOS menus do. */
const APPLE_MODIFIER_CAPS: Readonly<Record<string, string>> = {
  Command: '⌘',
  MacCtrl: '⌃',
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};
const OTHER_MODIFIER_CAPS: Readonly<Record<string, string>> = { MacCtrl: 'Ctrl' };
const KEY_CAPS: Readonly<Record<string, string>> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Comma: ',',
  Period: '.',
};

/** A shortcut as text, the way the browser shows it: `Alt+Shift+S`, or `⌥⇧S` on Apple platforms. */
export function formatCommandShortcut(shortcut: string, options: { apple: boolean }): string {
  return commandShortcutKeyCaps(shortcut, options).join(options.apple ? '' : '+');
}

/**
 * Whether two shortcuts press the same keys, whichever way each is written: Chrome on macOS
 * reports `⌘D` for the manifest's `Ctrl+D`, and Firefox's `Ctrl` is Command on Apple platforms.
 */
export function isSameCommandShortcut(
  first: string,
  second: string,
  options: { apple: boolean },
): boolean {
  const caps = (shortcut: string) => commandShortcutKeyCaps(shortcut, options).join('\u0000');
  return first !== '' && second !== '' && caps(first) === caps(second);
}

/**
 * The key caps of a shortcut as the browser reports it: Firefox and Chrome on Windows and Linux
 * write `Alt+Shift+S`, and Chrome on macOS writes glyphs such as `⌥⇧S`. On Apple platforms
 * Firefox's `Ctrl` means Command.
 */
export function commandShortcutKeyCaps(shortcut: string, { apple }: { apple: boolean }): string[] {
  if (!shortcut) return [];
  if (!shortcut.includes('+')) {
    // Chrome on macOS: modifier glyphs, then the key ("⌥⇧S", "⌘F5"); or a lone key ("F5").
    const glyphs = /^[⌘⌃⌥⇧]*/.exec(shortcut)?.[0] ?? '';
    const key = shortcut.slice(glyphs.length);
    return [...glyphs, ...(key ? [KEY_CAPS[key] ?? key] : [])];
  }
  const parts = shortcut.split('+');
  const modifierCaps = apple ? APPLE_MODIFIER_CAPS : OTHER_MODIFIER_CAPS;
  return parts.map((part, index) =>
    index < parts.length - 1 ? (modifierCaps[part] ?? part) : (KEY_CAPS[part] ?? part),
  );
}
