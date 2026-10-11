import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { ASK_AI_CONFIG } from '@/lib/ask-ai-config';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import type { ActionContext } from '@/services/action-kit';
import { actionApproval, runAction } from '@/services/actions';
import { readChatSuggestions } from '@/services/chat-actions';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

const page = { title: 'Current page', url: 'https://e2e.invalid/current' };

const suggest = (suggestions: unknown[], overrides: Partial<ActionContext> = {}) =>
  runAction(
    'suggestActions',
    { suggestions },
    {
      client: { kind: 'askAI' },
      settings: { ...defaultSettings, language: 'en' },
      activeTab: async () => page,
      ...overrides,
    },
  ) as Promise<{ suggestions: unknown[]; dropped: string[] }>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks Bar' },
    { id: 'work', parentId: 'bar', title: 'Work' },
    { id: 'policy', parentId: 'bar', title: 'Company', unmodifiable: 'managed' },
    { id: 'b1', parentId: 'work', title: 'Spec', url: 'https://e2e.invalid/spec' },
  ]);
});

describe('suggestActions', () => {
  it('resolves every kind against the library without changing anything', async () => {
    const result = await suggest([
      { kind: 'ask', label: 'More like this?', text: 'Find more pages like this one' },
      { kind: 'save', folder: 'Bookmarks Bar/Work' },
      { kind: 'option', label: 'Reading', text: 'Make a Reading folder' },
      { kind: 'open', ref: 'b:b1' },
    ]);
    expect(result).toEqual({
      suggestions: [
        { kind: 'ask', label: 'More like this?', text: 'Find more pages like this one' },
        {
          kind: 'save',
          url: page.url,
          title: page.title,
          folderRef: 'f:work',
          folderPath: 'Bookmarks Bar/Work',
        },
        { kind: 'option', label: 'Reading', text: 'Make a Reading folder' },
        { kind: 'open', ref: 'b:b1', title: 'Spec', url: 'https://e2e.invalid/spec' },
      ],
      dropped: [],
    });
    expect(bookmarks.writes).toEqual([]);
    expect(actionApproval('suggestActions', { untrustedContentSeen: true })).toBe('none');
  });

  it('drops buttons that point nowhere or at a managed folder, instead of guessing', async () => {
    const result = await suggest(
      [
        { kind: 'save', folder: 'Nowhere' },
        { kind: 'save', folder: 'Company' },
        { kind: 'open', ref: 'b:gone' },
        { kind: 'show', ref: 'b:b1' },
      ],
      { activeTab: async () => page },
    );
    expect(result.dropped).toEqual([
      'No folder matches "Nowhere".',
      'Bookmarks Bar/Company is managed by the browser.',
      'There is no bookmark b:gone to open.',
    ]);
    expect(result.suggestions).toEqual([
      { kind: 'show', ref: 'b:b1', title: 'Spec', folderId: 'work' },
    ]);
    const intoNew = await suggest([{ kind: 'save', folder: 'Work', newFolder: 'Reading' }]);
    expect(intoNew.suggestions).toEqual([
      expect.objectContaining({ kind: 'save', folderRef: 'f:work', newFolder: 'Reading' }),
    ]);
    const noPage = await suggest([{ kind: 'save', folder: 'Work' }], {
      activeTab: async () => undefined,
    });
    expect(noPage.dropped).toEqual(['There is no web page to save.']);
  });

  it('cuts long button text, caps the count, and reads back only valid results', async () => {
    const long = 'x'.repeat(ASK_AI_CONFIG.suggestion_label_chars + 20);
    const result = await suggest([{ kind: 'ask', label: long, text: 'Go' }]);
    const [button] = readChatSuggestions(result) as { label: string }[];
    expect(button.label.length).toBeLessThan(long.length);

    const tooMany = Array.from({ length: ASK_AI_CONFIG.max_suggestions + 1 }, () => ({
      kind: 'ask',
      label: 'Q',
      text: 'Q',
    }));
    expect(await suggest(tooMany)).toMatchObject({ error: { code: 'invalid_input' } });
    expect(readChatSuggestions({ suggestions: [{ kind: 'save' }] })).toEqual([]);
    expect(readChatSuggestions('nonsense')).toEqual([]);
  });
});
