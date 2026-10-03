import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  POPUP_SEARCH_HISTORY_BINDINGS,
  POPUP_SEARCH_INPUT_BINDINGS,
  POPUP_TREE_BINDINGS,
  popupShortcutsHint,
} from '@/hooks/use-popup-shortcuts';
import { SHORTCUT_BINDINGS, shortcutKeyCaps } from '@/lib/keyboard-shortcuts';
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
      ...caps(POPUP_TREE_BINDINGS.next),
      ...caps(POPUP_TREE_BINDINGS.previous),
      ...caps(POPUP_TREE_BINDINGS.expand),
      ...caps(POPUP_TREE_BINDINGS.collapse),
      ...caps(POPUP_TREE_BINDINGS.activate),
      ...caps(POPUP_SEARCH_INPUT_BINDINGS.escape),
      ...caps(POPUP_SEARCH_HISTORY_BINDINGS.open),
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
