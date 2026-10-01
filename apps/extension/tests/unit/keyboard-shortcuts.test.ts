import { describe, expect, it } from 'vitest';
import {
  canHandleShortcut,
  findShortcut,
  hasOpenOverlay,
  isBrowserReservedCombo,
  isComposingEvent,
  isTypingTarget,
  matchesShortcut,
  type ShortcutKeyEvent,
} from '@/lib/keyboard-shortcuts';

const noOverlay = { querySelector: () => null };
const withOverlay = { querySelector: () => ({}) as Element };

function keyEvent(key: string, overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 0,
    defaultPrevented: false,
    target: { tagName: 'BODY' } as unknown as EventTarget,
    ...overrides,
  };
}

const element = (props: Record<string, unknown>) => props as unknown as EventTarget;
const withRole = (tagName: string, role: string) =>
  element({ tagName, getAttribute: (name: string) => (name === 'role' ? role : null) });

describe('isTypingTarget', () => {
  it.each([
    ['text input', element({ tagName: 'INPUT', type: 'text' })],
    ['search input', element({ tagName: 'INPUT', type: 'search' })],
    ['url input', element({ tagName: 'INPUT', type: 'url' })],
    ['number input', element({ tagName: 'INPUT', type: 'number' })],
    ['input without a type', element({ tagName: 'INPUT' })],
    ['textarea', element({ tagName: 'TEXTAREA' })],
    ['select', element({ tagName: 'SELECT' })],
    ['contenteditable', element({ tagName: 'DIV', isContentEditable: true })],
    ['textbox role', withRole('DIV', 'textbox')],
    ['combobox role', withRole('DIV', 'combobox')],
  ])('treats a %s as typing', (_name, target) => {
    expect(isTypingTarget(target)).toBe(true);
  });

  it.each([
    ['checkbox', element({ tagName: 'INPUT', type: 'checkbox' })],
    ['button input', element({ tagName: 'INPUT', type: 'button' })],
    ['button', element({ tagName: 'BUTTON' })],
    ['link', element({ tagName: 'A' })],
    ['table row', element({ tagName: 'TR' })],
    ['menu button', withRole('BUTTON', 'menuitem')],
    ['missing target', null],
  ])('does not treat a %s as typing', (_name, target) => {
    expect(isTypingTarget(target)).toBe(false);
  });
});

describe('modifier and composition guards', () => {
  it('reserves every Ctrl and Cmd combination for the browser', () => {
    for (const key of ['l', 't', 'w', 'n', 'r', 'd', '/', 'ArrowUp', 'Backspace']) {
      expect(isBrowserReservedCombo(keyEvent(key, { ctrlKey: true }))).toBe(true);
      expect(isBrowserReservedCombo(keyEvent(key, { metaKey: true }))).toBe(true);
    }
    expect(isBrowserReservedCombo(keyEvent('l'))).toBe(false);
  });

  it('detects IME composition, including the keyCode 229 keydown', () => {
    expect(isComposingEvent(keyEvent('Enter', { isComposing: true }))).toBe(true);
    expect(isComposingEvent(keyEvent('Process', { keyCode: 229 }))).toBe(true);
    expect(isComposingEvent(keyEvent('Enter'))).toBe(false);
  });

  it('sees open dialogs and menus', () => {
    expect(hasOpenOverlay(withOverlay)).toBe(true);
    expect(hasOpenOverlay(noOverlay)).toBe(false);
  });
});

describe('matchesShortcut', () => {
  it('matches plain keys only without Ctrl, Cmd, or Alt', () => {
    expect(matchesShortcut(keyEvent('/'), { key: '/' })).toBe(true);
    expect(matchesShortcut(keyEvent('/', { ctrlKey: true }), { key: '/' })).toBe(false);
    expect(matchesShortcut(keyEvent('/', { metaKey: true }), { key: '/' })).toBe(false);
    expect(matchesShortcut(keyEvent('/', { altKey: true }), { key: '/' })).toBe(false);
  });

  it('ignores Shift for punctuation that needs it on some layouts', () => {
    expect(matchesShortcut(keyEvent('?', { shiftKey: true }), { key: '?' })).toBe(true);
    expect(matchesShortcut(keyEvent('/', { shiftKey: true }), { key: '/' })).toBe(true);
  });

  it('requires the exact Shift state for letters and named keys', () => {
    expect(matchesShortcut(keyEvent('j'), { key: 'j' })).toBe(true);
    expect(matchesShortcut(keyEvent('J', { shiftKey: true }), { key: 'j' })).toBe(false);
    expect(matchesShortcut(keyEvent('ArrowUp', { shiftKey: true }), { key: 'ArrowUp' })).toBe(
      false,
    );
  });

  it('requires Alt exactly when the binding asks for it', () => {
    const binding = { key: 'ArrowUp', alt: true };
    expect(matchesShortcut(keyEvent('ArrowUp', { altKey: true }), binding)).toBe(true);
    expect(matchesShortcut(keyEvent('ArrowUp'), binding)).toBe(false);
    expect(matchesShortcut(keyEvent('ArrowUp', { altKey: true, ctrlKey: true }), binding)).toBe(
      false,
    );
  });
});

describe('canHandleShortcut and findShortcut', () => {
  const bindings = {
    focus: [{ key: '/' }],
    parent: [{ key: 'ArrowUp', alt: true }, { key: 'Backspace' }],
    escape: [{ key: 'Escape' }],
  } as const;
  const options = { root: noOverlay };

  it('finds the action for a matching key', () => {
    expect(findShortcut(keyEvent('/'), bindings, options)).toBe('focus');
    expect(findShortcut(keyEvent('Backspace'), bindings, options)).toBe('parent');
    expect(findShortcut(keyEvent('ArrowUp', { altKey: true }), bindings, options)).toBe('parent');
    expect(findShortcut(keyEvent('x'), bindings, options)).toBeNull();
  });

  it('does nothing while typing unless the caller allows it', () => {
    const typing = { target: element({ tagName: 'INPUT', type: 'text' }) };
    expect(findShortcut(keyEvent('/', typing), bindings, options)).toBeNull();
    expect(findShortcut(keyEvent('Backspace', typing), bindings, options)).toBeNull();
    expect(
      findShortcut(keyEvent('Escape', typing), bindings, { ...options, allowWhileTyping: true }),
    ).toBe('escape');
  });

  it('does nothing while a dialog or menu is open unless the caller allows it', () => {
    expect(findShortcut(keyEvent('/'), bindings, { root: withOverlay })).toBeNull();
    expect(
      findShortcut(keyEvent('Escape'), bindings, { root: withOverlay, allowWithOverlay: true }),
    ).toBe('escape');
  });

  it('does nothing during IME composition, with Ctrl or Cmd, or after another handler', () => {
    expect(canHandleShortcut(keyEvent('/', { isComposing: true }), options)).toBe(false);
    expect(canHandleShortcut(keyEvent('/', { keyCode: 229 }), options)).toBe(false);
    expect(canHandleShortcut(keyEvent('/', { ctrlKey: true }), options)).toBe(false);
    expect(canHandleShortcut(keyEvent('/', { metaKey: true }), options)).toBe(false);
    expect(canHandleShortcut(keyEvent('/', { defaultPrevented: true }), options)).toBe(false);
    expect(canHandleShortcut(keyEvent('/'), options)).toBe(true);
  });
});
