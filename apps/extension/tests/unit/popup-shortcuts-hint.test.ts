import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { POPUP_SEARCH_INPUT_BINDINGS, popupShortcutsHint } from '@/hooks/use-popup-shortcuts';
import {
  getPageShortcutBindings,
  SHORTCUT_BINDINGS,
  shortcutKeyCaps,
  TREE_KEY_BINDINGS,
} from '@/lib/keyboard-shortcuts';
import { saveSettings } from '@/lib/settings-storage';

const caps = (bindings: readonly { key: string; alt?: boolean }[]) =>
  bindings.map((binding) => shortcutKeyCaps(binding).join('+'));

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage('en');
});

describe('popup shortcuts tooltip', () => {
  it('names every key from the bindings, not from the message text', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const hint = popupShortcutsHint();
    const keys = [
      ...caps(SHORTCUT_BINDINGS.popup.focusSearch),
      ...caps(TREE_KEY_BINDINGS.next),
      ...caps(TREE_KEY_BINDINGS.previous),
      ...caps(TREE_KEY_BINDINGS.expand),
      ...caps(TREE_KEY_BINDINGS.collapse),
      ...caps(TREE_KEY_BINDINGS.activate),
      ...caps(POPUP_SEARCH_INPUT_BINDINGS.escape),
      ...caps(SHORTCUT_BINDINGS.popupSearchHistory.open),
    ];
    for (const key of keys) expect(hint).toContain(key);
    expect(hint).toBe(
      'Shortcuts: / search, ↓ ↑ move through folders and bookmarks, → ← open or close a folder, ↵ save the current page to the focused folder, Esc clear the search, and Alt+↓ show recent searches',
    );
  });

  it('prints Apple key caps on Apple platforms', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(popupShortcutsHint()).toContain('⌥+↓ show recent searches');
  });

  it('uses each language list style and word order', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    await saveSettings({ language: 'ja' });
    setLanguage('ja');
    expect(popupShortcutsHint()).toBe(
      'ショートカット: / で検索、↓ ↑ でフォルダとブックマークを移動、→ ← でフォルダを開閉、↵ で現在のページをフォーカス中のフォルダに保存、Esc で検索をクリア、Alt+↓ で最近の検索を表示',
    );
  });
});

describe('popup shortcuts tooltip with changed keys', () => {
  it('names the keys the user gave the search shortcuts instead of the configured ones', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const page = getPageShortcutBindings({
      'popup.focus_search': [{ key: 'f', alt: true }],
      'popup.recent_searches': [{ key: 'F8' }],
    });
    const hint = popupShortcutsHint(page);
    expect(hint).toContain('Alt+F search');
    expect(hint).toContain('F8 show recent searches');
    expect(hint).not.toContain('/ search');
  });
});
