import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  findShortcut,
  getPageShortcutBindings,
  matchesShortcut,
  PAGE_SHORTCUT_IDS,
  type PageShortcutOverrides,
  type ShortcutKeyEvent,
} from '@/lib/keyboard-shortcuts';
import { defaultSettings, getSettingScope, type Settings } from '@/lib/settings-schema';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import {
  checkShortcutKeys,
  checkShortcutReset,
  findConflictingShortcut,
  isSameBinding,
  PAGE_SHORTCUT_LABEL_KEYS,
  parsePageShortcutOverrides,
  REMAPPABLE_SHORTCUT_IDS,
  readShortcutKeys,
  withoutPageShortcut,
  withPageShortcut,
} from '@/lib/shortcut-remap';
import { readConfigToml } from '../config-files';

const limits = (() => {
  const behavior = readConfigToml('settings/behavior.toml') as {
    page_shortcuts: { overrides: { max_bindings: number; max_key_length: number } };
  };
  const { max_bindings, max_key_length } = behavior.page_shortcuts.overrides;
  return { maxBindings: max_bindings, maxKeyLength: max_key_length };
})();

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

const options = { allowModifiers: true, root: { querySelectorAll: () => [] } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('effective in-page shortcut bindings', () => {
  it('uses the configured keys for every shortcut the user did not change', () => {
    const apple = false;
    const page = getPageShortcutBindings({}, apple);
    expect(page.manager.nextRow).toEqual([{ key: 'j' }]);
    expect(page.manager.open).toEqual([{ key: 'Enter' }]);
    expect(page.popup.focusSearch).toEqual([{ key: '/' }]);
  });

  it('puts the user keys in place of the configured ones, and only for that shortcut', () => {
    const overrides: PageShortcutOverrides = {
      'manager.next_row': [{ key: 'n' }],
      'popup.focus_search': [{ key: 'F2' }],
    };
    const page = getPageShortcutBindings(overrides, false);
    expect(page.manager.nextRow).toEqual([{ key: 'n' }]);
    expect(page.manager.previousRow).toEqual([{ key: 'k' }]);
    expect(page.popup.focusSearch).toEqual([{ key: 'F2' }]);

    // The new key works and the old one does not.
    expect(findShortcut(keyEvent('n'), page.manager, options)).toBe('nextRow');
    expect(findShortcut(keyEvent('j'), page.manager, options)).toBeNull();
  });

  it('labels every in-page shortcut in Options', () => {
    expect(Object.keys(PAGE_SHORTCUT_LABEL_KEYS).sort()).toEqual([...PAGE_SHORTCUT_IDS].sort());
  });

  it('leaves the clipboard keys out of what the user can change', () => {
    expect(REMAPPABLE_SHORTCUT_IDS).not.toContain('manager.copy');
    expect(REMAPPABLE_SHORTCUT_IDS).toContain('manager.undo');
    expect(REMAPPABLE_SHORTCUT_IDS).toContain('popup.focus_search');
  });
});

describe('stored shortcut overrides', () => {
  it('stores each entry of the right shape and size, dropping a malformed one alone', async () => {
    const tooMany = Array.from({ length: limits.maxBindings + 1 }, (_, i) => ({
      key: `F${i + 1}`,
    }));
    await saveSettings({
      pageShortcutOverrides: {
        'manager.next_row': [{ key: 'n' }],
        'manager.undo': [{ key: '' }],
        'manager.redo': [],
        'manager.preview': [{ key: 'v', extra: true }],
        'manager.rename': tooMany,
        'manager.delete': [{ key: 'x'.repeat(limits.maxKeyLength + 1) }],
        'not an id': [{ key: 'x' }],
      } as unknown as Settings['pageShortcutOverrides'],
    });
    expect((await getSettings()).pageShortcutOverrides).toEqual({
      'manager.next_row': [{ key: 'n' }],
    });
  });

  it('uses only shortcuts the user can change, with keys their page allows', () => {
    const parsed = parsePageShortcutOverrides({
      'manager.next_row': [{ key: 'n' }],
      'manager.copy': [{ key: 'c', mod: true }],
      'manager.no_such_shortcut': [{ key: 'x' }],
      'popup.focus_search': [{ key: 'f', mod: true }],
      'popup.recent_searches': [{ key: 'F8' }],
    });
    expect(parsed).toEqual({
      'manager.next_row': [{ key: 'n' }],
      'popup.recent_searches': [{ key: 'F8' }],
    });
  });

  it('is a device setting that starts empty and survives a save and read', async () => {
    fakeBrowser.reset();
    expect(defaultSettings.pageShortcutOverrides).toEqual({});
    expect(getSettingScope('pageShortcutOverrides')).toBe('device');
    await saveSettings({
      pageShortcutOverrides: { 'manager.preview': [{ key: 'v', shift: true }] },
    });
    expect((await getSettings()).pageShortcutOverrides).toEqual({
      'manager.preview': [{ key: 'v', shift: true }],
    });
  });

  it('stores nothing for a shortcut set back to its configured keys', () => {
    const changed = withPageShortcut({}, 'manager.next_row', [{ key: 'n' }], false);
    expect(changed).toEqual({ 'manager.next_row': [{ key: 'n' }] });
    expect(withPageShortcut(changed, 'manager.next_row', [{ key: 'j' }], false)).toEqual({});
    expect(withoutPageShortcut(changed, 'manager.next_row')).toEqual({});
  });
});

describe('conflicts between shortcuts', () => {
  it('has none among the configured keys, on either platform', () => {
    for (const apple of [false, true]) {
      const conflicts = PAGE_SHORTCUT_IDS.filter((id) => checkShortcutReset(id, {}, apple));
      expect(conflicts).toEqual([]);
    }
  });

  it('names the shortcut of the same section that has the keys', () => {
    expect(checkShortcutKeys('manager.next_row', { key: 'k' }, {}, false)).toEqual({
      kind: 'inUse',
      by: 'manager.previous_row',
    });
    // Ctrl+C is the browser's copy key, which the manager reads, so it is taken too.
    expect(findConflictingShortcut('manager.undo', { key: 'c', mod: true }, {}, false)).toBe(
      'manager.copy',
    );
    // Keys the user moved count where they are now, not where they were configured.
    const moved: PageShortcutOverrides = { 'manager.previous_row': [{ key: 'u' }] };
    expect(checkShortcutKeys('manager.next_row', { key: 'k' }, moved, false)).toBeNull();
    expect(checkShortcutKeys('manager.next_row', { key: 'u' }, moved, false)).toEqual({
      kind: 'inUse',
      by: 'manager.previous_row',
    });
  });

  it('lets a key do one thing in each place that never acts at the same time', () => {
    // The popup and the manager are different pages.
    expect(checkShortcutKeys('popup.focus_search', { key: 'j' }, {}, false)).toBeNull();
    // The preview's keys act only in the open preview, where the manager's other keys pause.
    expect(checkShortcutKeys('manager.preview_next', { key: 'j' }, {}, false)).toBeNull();
    const previewKeys: PageShortcutOverrides = { 'manager.preview_previous': [{ key: 'h' }] };
    expect(checkShortcutKeys('manager.preview_next', { key: 'h' }, previewKeys, false)).toEqual({
      kind: 'inUse',
      by: 'manager.preview_previous',
    });
  });

  it('refuses a reset whose keys another shortcut took meanwhile', () => {
    const overrides: PageShortcutOverrides = {
      'manager.next_row': [{ key: 'n' }],
      'manager.preview': [{ key: 'j' }],
    };
    expect(checkShortcutReset('manager.next_row', overrides, false)).toEqual({
      kind: 'inUse',
      by: 'manager.preview',
    });
    expect(checkShortcutReset('manager.preview', overrides, false)).toBeNull();
  });
});

describe('keys a shortcut may take', () => {
  it('keeps Ctrl and Cmd out of the popup', () => {
    expect(checkShortcutKeys('popup.focus_search', { key: 'k', mod: true }, {}, false)).toEqual({
      kind: 'noModifierHere',
    });
    expect(checkShortcutKeys('manager.preview', { key: 'e', mod: true }, {}, false)).toBeNull();
  });

  it('needs a key that types nothing for a shortcut that works while typing', () => {
    expect(checkShortcutKeys('popup.recent_searches', { key: 'h' }, {}, false)).toEqual({
      kind: 'needsNamedKey',
    });
    expect(checkShortcutKeys('popup.recent_searches', { key: 'F8' }, {}, false)).toBeNull();
  });

  it('refuses keys the browser or the lists keep, but gives a shortcut its own keys back', () => {
    expect(checkShortcutKeys('manager.preview', { key: 't', mod: true }, {}, false)).toEqual({
      kind: 'reserved',
    });
    expect(checkShortcutKeys('manager.preview', { key: 'Tab' }, {}, false)).toEqual({
      kind: 'reserved',
    });
    expect(checkShortcutKeys('manager.preview', { key: 'Enter' }, {}, false)).toEqual({
      kind: 'reserved',
    });
    // Keys the manager's rows and cards answer with Shift, Ctrl or Cmd, or both, and the
    // browser's developer tools, view source, and open file.
    for (const binding of [
      { key: 'ArrowDown', shift: true },
      { key: 'End', shift: true },
      { key: ' ', shift: true },
      { key: 'Home', mod: true },
      { key: 'ArrowLeft', mod: true },
      { key: ' ', mod: true },
      { key: 'ArrowUp', mod: true, shift: true },
      { key: 'I', mod: true, shift: true },
      { key: 'J', mod: true, shift: true },
      { key: 'C', mod: true, shift: true },
      { key: 'u', mod: true },
      { key: 'o', mod: true },
    ]) {
      expect(
        checkShortcutKeys('manager.delete', binding, {}, false),
        JSON.stringify(binding),
      ).toEqual({ kind: 'reserved' });
    }
    expect(checkShortcutKeys('manager.delete', { key: 'a' }, {}, false)).toBeNull();
    // Cmd+O is Open's own configured key on a Mac.
    expect(
      checkShortcutKeys(
        'manager.open',
        { key: 'o', mod: true },
        { 'manager.open': [{ key: 'F9' }] },
        true,
      ),
    ).toBeNull();
    // Enter is Open's own configured key on Windows and Linux.
    const moved: PageShortcutOverrides = { 'manager.open': [{ key: 'F9' }] };
    expect(checkShortcutKeys('manager.open', { key: 'Enter' }, moved, false)).toBeNull();
  });
});

describe('recording keys', () => {
  it('waits while only modifiers are held', () => {
    expect(readShortcutKeys(keyEvent('Shift', { shiftKey: true }), false)).toEqual({
      status: 'pending',
    });
    expect(readShortcutKeys(keyEvent('Meta', { metaKey: true }), true)).toEqual({
      status: 'pending',
    });
  });

  it('reads Ctrl as mod elsewhere and Cmd as mod on a Mac, refusing the other one', () => {
    expect(readShortcutKeys(keyEvent('e', { ctrlKey: true, code: 'KeyE' }), false)).toEqual({
      status: 'recorded',
      binding: { key: 'e', mod: true },
    });
    expect(readShortcutKeys(keyEvent('e', { metaKey: true, code: 'KeyE' }), true)).toEqual({
      status: 'recorded',
      binding: { key: 'e', mod: true },
    });
    expect(readShortcutKeys(keyEvent('e', { ctrlKey: true, code: 'KeyE' }), true)).toEqual({
      status: 'invalid',
      problem: 'otherModifier',
    });
    expect(readShortcutKeys(keyEvent('e', { metaKey: true, code: 'KeyE' }), false)).toEqual({
      status: 'invalid',
      problem: 'otherModifier',
    });
  });

  it('names a letter typed with Alt or Ctrl by its position, as matching does', () => {
    // Option+J types ∆ on a Mac.
    const optionJ = keyEvent('∆', { altKey: true, code: 'KeyJ' });
    const recorded = readShortcutKeys(optionJ, true);
    expect(recorded).toEqual({ status: 'recorded', binding: { key: 'j', alt: true } });
    if (recorded.status !== 'recorded') throw new Error('not recorded');
    expect(matchesShortcut(optionJ, recorded.binding, true)).toBe(true);
    expect(
      readShortcutKeys(keyEvent('Z', { ctrlKey: true, shiftKey: true, code: 'KeyZ' }), false),
    ).toEqual({ status: 'recorded', binding: { key: 'z', shift: true, mod: true } });
  });

  it('keeps a letter case with Shift, and drops Shift from punctuation', () => {
    const shiftJ = keyEvent('J', { shiftKey: true, code: 'KeyJ' });
    const recorded = readShortcutKeys(shiftJ, false);
    expect(recorded).toEqual({ status: 'recorded', binding: { key: 'J', shift: true } });
    if (recorded.status !== 'recorded') throw new Error('not recorded');
    expect(matchesShortcut(shiftJ, recorded.binding, false)).toBe(true);
    expect(matchesShortcut(keyEvent('j', { code: 'KeyJ' }), recorded.binding, false)).toBe(false);
    expect(readShortcutKeys(keyEvent('?', { shiftKey: true, code: 'Slash' }), false)).toEqual({
      status: 'recorded',
      binding: { key: '?' },
    });
    expect(
      readShortcutKeys(keyEvent('ArrowUp', { shiftKey: true, code: 'ArrowUp' }), false),
    ).toEqual({ status: 'recorded', binding: { key: 'ArrowUp', shift: true } });
  });

  it('refuses dead keys and keys an input method is composing', () => {
    expect(readShortcutKeys(keyEvent('Dead', { code: 'Quote' }), false)).toEqual({
      status: 'invalid',
      problem: 'unsupportedKey',
    });
    expect(readShortcutKeys(keyEvent('a', { isComposing: true }), false)).toEqual({
      status: 'invalid',
      problem: 'unsupportedKey',
    });
  });

  it('treats the same combination typed in either case as one binding', () => {
    expect(isSameBinding({ key: 'Z', mod: true }, { key: 'z', mod: true })).toBe(true);
    expect(isSameBinding({ key: '?', shift: true }, { key: '?' })).toBe(true);
    expect(isSameBinding({ key: 'J', shift: true }, { key: 'j' })).toBe(false);
  });
});

beforeEach(() => {
  fakeBrowser.reset();
});
