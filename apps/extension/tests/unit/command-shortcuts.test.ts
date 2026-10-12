import { describe, expect, it } from 'vitest';
import {
  type CommandShortcutKeyEvent,
  commandShortcutKeyCaps,
  formatCommandShortcut,
  isSameCommandShortcut,
  isValidCommandShortcut,
  readCommandShortcut,
} from '@/lib/command-shortcuts';

function press(
  code: string,
  modifiers: Partial<Omit<CommandShortcutKeyEvent, 'code'>> = {},
): CommandShortcutKeyEvent {
  return {
    key: modifiers.key ?? code,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

const other = { apple: false };
const apple = { apple: true };

describe('isValidCommandShortcut', () => {
  it.each([
    'Alt+Shift+S',
    'Ctrl+Shift+Y',
    'Ctrl+Alt+P',
    'Command+Shift+K',
    'MacCtrl+Alt+1',
    'Alt+F5',
    'F5',
    'F19',
    'Alt+Comma',
    'Ctrl+PageDown',
    'Alt+Up',
    'MediaPlayPause',
  ])('accepts %s', (shortcut) => {
    expect(isValidCommandShortcut(shortcut)).toBe(true);
  });

  it.each([
    ['a letter alone', 'S'],
    ['Shift as the only modifier', 'Shift+S'],
    ['Shift first', 'Shift+Alt+S'],
    ['three modifiers', 'Ctrl+Alt+Shift+S'],
    ['the same modifier twice', 'Alt+Alt+S'],
    ['a lowercase key', 'Alt+s'],
    ['an unsupported key', 'Alt+Tab'],
    ['F20', 'F20'],
    ['a media key with a modifier', 'Alt+MediaStop'],
    ['nothing', ''],
  ])('rejects %s', (_label, shortcut) => {
    expect(isValidCommandShortcut(shortcut)).toBe(false);
  });
});

describe('readCommandShortcut', () => {
  it('reads Alt+Shift+letter from the physical key, not the typed character', () => {
    // Option+Shift+S types "Í" on a US Mac keyboard.
    expect(
      readCommandShortcut(press('KeyS', { key: 'Í', altKey: true, shiftKey: true }), apple),
    ).toEqual({ status: 'valid', shortcut: 'Alt+Shift+S' });
    expect(
      readCommandShortcut(press('KeyS', { key: 'S', altKey: true, shiftKey: true }), other),
    ).toEqual({ status: 'valid', shortcut: 'Alt+Shift+S' });
  });

  it('names Apple modifiers Command and MacCtrl, and others Ctrl', () => {
    expect(readCommandShortcut(press('KeyK', { metaKey: true, shiftKey: true }), apple)).toEqual({
      status: 'valid',
      shortcut: 'Command+Shift+K',
    });
    expect(readCommandShortcut(press('KeyK', { ctrlKey: true, altKey: true }), apple)).toEqual({
      status: 'valid',
      shortcut: 'MacCtrl+Alt+K',
    });
    expect(readCommandShortcut(press('KeyK', { ctrlKey: true, shiftKey: true }), other)).toEqual({
      status: 'valid',
      shortcut: 'Ctrl+Shift+K',
    });
  });

  it('maps digits, the numpad, arrows, punctuation, and function keys', () => {
    expect(readCommandShortcut(press('Digit3', { altKey: true }), other)).toEqual({
      status: 'valid',
      shortcut: 'Alt+3',
    });
    expect(readCommandShortcut(press('Numpad7', { ctrlKey: true }), other)).toEqual({
      status: 'valid',
      shortcut: 'Ctrl+7',
    });
    expect(readCommandShortcut(press('ArrowLeft', { altKey: true }), other)).toEqual({
      status: 'valid',
      shortcut: 'Alt+Left',
    });
    expect(readCommandShortcut(press('Comma', { key: ',', altKey: true }), other)).toEqual({
      status: 'valid',
      shortcut: 'Alt+Comma',
    });
    expect(readCommandShortcut(press('F8'), other)).toEqual({ status: 'valid', shortcut: 'F8' });
    expect(readCommandShortcut(press('F15', { ctrlKey: true }), other)).toEqual({
      status: 'valid',
      shortcut: 'Ctrl+F15',
    });
  });

  it('accepts a media key on its own, by code or by key', () => {
    expect(readCommandShortcut(press('MediaTrackNext'), other)).toEqual({
      status: 'valid',
      shortcut: 'MediaNextTrack',
    });
    expect(readCommandShortcut(press('', { key: 'MediaPlayPause' }), other)).toEqual({
      status: 'valid',
      shortcut: 'MediaPlayPause',
    });
    expect(readCommandShortcut(press('MediaStop', { altKey: true }), other)).toMatchObject({
      status: 'invalid',
      problem: 'unsupportedKey',
    });
  });

  it('waits while only modifiers are held', () => {
    expect(
      readCommandShortcut(press('AltLeft', { key: 'Alt', altKey: true, shiftKey: true }), other),
    ).toEqual({ status: 'pending', keys: ['Alt', 'Shift'] });
    expect(readCommandShortcut(press('MetaLeft', { key: 'Meta', metaKey: true }), apple)).toEqual({
      status: 'pending',
      keys: ['Command'],
    });
  });

  it('explains why a combination cannot be used', () => {
    expect(readCommandShortcut(press('KeyS', { key: 's' }), other)).toEqual({
      status: 'invalid',
      problem: 'needsModifier',
      keys: ['S'],
    });
    expect(readCommandShortcut(press('KeyS', { shiftKey: true }), other)).toEqual({
      status: 'invalid',
      problem: 'needsModifier',
      keys: ['Shift', 'S'],
    });
    expect(
      readCommandShortcut(press('KeyS', { ctrlKey: true, altKey: true, shiftKey: true }), other),
    ).toEqual({
      status: 'invalid',
      problem: 'tooManyModifiers',
      keys: ['Ctrl', 'Alt', 'Shift', 'S'],
    });
    expect(readCommandShortcut(press('Backquote', { key: '`', altKey: true }), other)).toEqual({
      status: 'invalid',
      problem: 'unsupportedKey',
      keys: ['Alt'],
    });
    // The Windows or Super key has no name in the shortcut format.
    expect(readCommandShortcut(press('KeyS', { metaKey: true }), other)).toMatchObject({
      status: 'invalid',
      problem: 'unsupportedKey',
    });
  });
});

describe('commandShortcutKeyCaps', () => {
  it('splits shortcuts written with plus signs', () => {
    expect(commandShortcutKeyCaps('Alt+Shift+S', other)).toEqual(['Alt', 'Shift', 'S']);
    expect(commandShortcutKeyCaps('Alt+Up', other)).toEqual(['Alt', '↑']);
    expect(commandShortcutKeyCaps('MacCtrl+Comma', other)).toEqual(['Ctrl', ',']);
  });

  it('draws Apple modifier symbols, with Ctrl as Command', () => {
    expect(commandShortcutKeyCaps('Alt+Shift+S', apple)).toEqual(['⌥', '⇧', 'S']);
    expect(commandShortcutKeyCaps('Ctrl+Shift+K', apple)).toEqual(['⌘', '⇧', 'K']);
    expect(commandShortcutKeyCaps('MacCtrl+F5', apple)).toEqual(['⌃', 'F5']);
  });

  it("splits Chrome's macOS glyph shortcuts and keeps a lone key whole", () => {
    expect(commandShortcutKeyCaps('⌥⇧S', apple)).toEqual(['⌥', '⇧', 'S']);
    expect(commandShortcutKeyCaps('⌘F5', apple)).toEqual(['⌘', 'F5']);
    expect(commandShortcutKeyCaps('F5', other)).toEqual(['F5']);
    expect(commandShortcutKeyCaps('MediaPlayPause', other)).toEqual(['MediaPlayPause']);
    expect(commandShortcutKeyCaps('', other)).toEqual([]);
  });
});

describe('formatCommandShortcut', () => {
  it('joins keys with plus signs, or runs glyphs together on Apple platforms', () => {
    expect(formatCommandShortcut('Ctrl+D', other)).toBe('Ctrl+D');
    expect(formatCommandShortcut('Ctrl+D', apple)).toBe('⌘D');
    expect(formatCommandShortcut('Alt+Shift+S', apple)).toBe('⌥⇧S');
  });
});

describe('isSameCommandShortcut', () => {
  it("matches the manifest's Ctrl+D to Chrome's ⌘D on macOS and Firefox's Command+D", () => {
    expect(isSameCommandShortcut('⌘D', 'Ctrl+D', apple)).toBe(true);
    expect(isSameCommandShortcut('Command+D', 'Ctrl+D', apple)).toBe(true);
    expect(isSameCommandShortcut('Ctrl+D', 'Ctrl+D', other)).toBe(true);
  });

  it('tells Control from Command, other keys, and an unset shortcut apart', () => {
    expect(isSameCommandShortcut('⌃D', 'Ctrl+D', apple)).toBe(false);
    expect(isSameCommandShortcut('MacCtrl+D', 'Ctrl+D', apple)).toBe(false);
    expect(isSameCommandShortcut('Ctrl+Shift+D', 'Ctrl+D', other)).toBe(false);
    expect(isSameCommandShortcut('', '', other)).toBe(false);
  });
});
