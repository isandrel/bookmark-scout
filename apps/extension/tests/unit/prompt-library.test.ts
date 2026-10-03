import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { formatKilobytes, setLanguage } from '@/hooks/use-i18n';
import {
  MAX_PROMPT_BYTES,
  PromptValidationError,
  customPromptBytes,
  deleteCustomPrompt,
  getPromptLibrary,
  saveCustomPrompt,
  setActivePrompt,
  syncItemBytes,
  validateCustomPrompt,
} from '@/lib/prompt-library-storage';
import { defaultSettings } from '@/lib/settings-schema';
import {
  PROMPT_TASK_IDS,
  PROMPT_TASKS,
  buildPrompt,
  findUnknownPromptVariables,
  getPromptVariables,
} from '@/services/prompt-config';

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

const ONE_ITEM_RULE = 'Return exactly one item per bookmark and preserve bookmarkId/title exactly.';
const tagging = { autoTaggingMinTags: 2, autoTaggingMaxTags: 3, autoTaggingTagStyle: 'kebab-case' } as const;

describe('prompt variables', () => {
  it('fills every variable each task declares, for previews and runs alike', () => {
    for (const taskId of PROMPT_TASK_IDS) {
      const variables = getPromptVariables(taskId, defaultSettings);
      for (const { name } of PROMPT_TASKS[taskId].variables) {
        expect(variables[name], `${taskId}.${name}`).toBeDefined();
      }
    }
    expect(getPromptVariables('summarization', defaultSettings).includeDomainHint).toMatch(
      /^(true|false)$/,
    );
  });

  it('fills unlimited folder limits with a phrase, never -1, even in a custom prompt', async () => {
    const unlimited = { aiMaxCategories: -1, aiMinItemsPerFolder: 2, aiMaxItemsPerFolder: -1 };
    expect(getPromptVariables('folder_reorganization', unlimited)).toEqual({
      maxCategories: 'no limit',
      minItemsPerFolder: 2,
      maxItemsPerFolder: 'no limit',
    });
    expect(
      getPromptVariables('folder_reorganization', {
        ...unlimited,
        aiMaxCategories: 5,
        aiMaxItemsPerFolder: 40,
      }),
    ).toMatchObject({ maxCategories: 5, maxItemsPerFolder: 40 });

    const saved = await saveCustomPrompt({
      task: 'folder_reorganization',
      name: 'Old limits',
      system: 'Use {{maxCategories}} top-level folders and {{maxItemsPerFolder}} bookmarks each.',
    });
    await setActivePrompt('folder_reorganization', saved.id);
    const { system } = await buildPrompt('folder_reorganization', unlimited);
    expect(system).toContain('Use no limit top-level folders and no limit bookmarks each.');
    expect(system).not.toMatch(/(^|[^0-9])-1\b/);
  });

  it('leaves no placeholder unfilled in any built-in prompt and its rules', async () => {
    for (const taskId of PROMPT_TASK_IDS) {
      const { system } = await buildPrompt(taskId, defaultSettings, { hasPageText: true });
      expect(system, taskId).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it('adds the task rules always and the page-text rule only for page text', async () => {
    const plain = (await buildPrompt('auto_tagging', tagging)).system;
    expect(plain.endsWith(`\n\n${ONE_ITEM_RULE}`)).toBe(true);
    expect(plain).not.toContain('pageText');
    const withPages = (await buildPrompt('auto_tagging', tagging, { hasPageText: true })).system;
    expect(withPages).toContain(`${ONE_ITEM_RULE}\n\nSome items include pageText`);
    expect((await buildPrompt('folder_recommendation', { aiMaxRecommendations: 7 })).system).toContain(
      'Return exactly 7 folder recommendations',
    );
  });
});

describe('prompt library', () => {
  it('uses the built-in prompt until a custom one is active', async () => {
    const { system } = await buildPrompt('auto_tagging', {
      ...tagging,
      autoTaggingMaxTags: 4,
    });
    expect(system).toContain('Suggest 2-4 tags per bookmark');

    const saved = await saveCustomPrompt({
      task: 'auto_tagging',
      name: 'Short tags',
      system: 'Use {{maxTags}} one-word tags at most.',
    });
    // Saved but not active yet: still the built-in prompt.
    expect((await buildPrompt('auto_tagging', tagging)).system).toContain('Suggest 2-3 tags');
    await setActivePrompt('auto_tagging', saved.id);
    expect((await buildPrompt('auto_tagging', tagging)).system).toBe(
      `Use 3 one-word tags at most.\n\n${ONE_ITEM_RULE}`,
    );
    await setActivePrompt('auto_tagging', undefined);
    expect((await buildPrompt('auto_tagging', tagging)).system).toContain(
      PROMPT_TASKS.auto_tagging.system
        .replace('{{minTags}}-{{maxTags}}', '2-3')
        .replace('{{tagStyle}}', 'kebab-case'),
    );
  });

  it('keeps several prompts per task and falls back to the default when the active one is deleted', async () => {
    const first = await saveCustomPrompt({ task: 'summarization', name: 'One', system: 'A' });
    const second = await saveCustomPrompt({ task: 'summarization', name: 'Two', system: 'B' });
    await setActivePrompt('summarization', second.id);
    let library = await getPromptLibrary();
    expect(library.prompts.map((prompt) => prompt.name)).toEqual(['One', 'Two']);
    expect(library.active.summarization).toBe(second.id);

    await deleteCustomPrompt(second.id);
    library = await getPromptLibrary();
    expect(library.prompts.map((prompt) => prompt.id)).toEqual([first.id]);
    expect(library.active.summarization).toBeUndefined();
    const { system } = await buildPrompt('summarization', defaultSettings);
    expect(system.startsWith('You are a content summarizer.')).toBe(true);
  });

  it('stores each prompt as its own sync item to stay under the per-item quota', async () => {
    const saved = await saveCustomPrompt({ task: 'auto_tagging', name: 'N', system: 'Text' });
    const stored = await fakeBrowser.storage.sync.get(null);
    expect(Object.keys(stored).sort()).toEqual([
      'bookmark-scout-prompt-' + saved.id,
      'bookmark-scout-prompts',
    ]);
  });

  it('measures a sync item the way Chrome counts it against the 8,192-byte item quota', () => {
    // The longest string Chrome 2026-10 accepted in `{ k: { s } }` for each character.
    const browserMaxima: [string, number][] = [
      ['x', 8183],
      ['"', 4091],
      ['\\', 4091],
      ['\n', 4091],
      ['<', 1363],
      ['\u0001', 1363],
      ['\u2028', 1363],
      ['あ', 2727],
      ['\u{1F600}', 2045],
    ];
    for (const [char, max] of browserMaxima) {
      expect(syncItemBytes('k', { s: char.repeat(max) }), char).toBeLessThanOrEqual(8192);
      expect(syncItemBytes('k', { s: char.repeat(max + 1) }), char).toBeGreaterThan(8192);
    }
  });

  it('counts the prompt as it is stored and rejects one too large to sync', async () => {
    const draft = { task: 'auto_tagging' as const, name: 'Quotes', system: 'Say "hi" <b>' };
    const saved = await saveCustomPrompt(draft);
    const key = `bookmark-scout-prompt-${saved.id}`;
    const stored = (await fakeBrowser.storage.sync.get(key))[key];
    expect(customPromptBytes(draft)).toBe(syncItemBytes(key, stored));

    // Under the limit as UTF-8 text, but escaped quotes double it in storage.
    const quotes = '"'.repeat(MAX_PROMPT_BYTES - 10);
    expect(validateCustomPrompt({ ...draft, system: quotes })).toBe(
      `The prompt is too long to sync. Keep it within ${formatKilobytes(MAX_PROMPT_BYTES)}.`,
    );
    await expect(saveCustomPrompt({ ...draft, system: quotes })).rejects.toBeInstanceOf(
      PromptValidationError,
    );
    await expect(
      saveCustomPrompt({ task: 'auto_tagging', name: ' ', system: 'x' }),
    ).rejects.toThrow('Enter a name.');
  });

  it('flags variables the task does not fill in', () => {
    expect(findUnknownPromptVariables('auto_tagging', '{{maxTags}} {{nope}} {{nope}}')).toEqual([
      'nope',
    ]);
  });
});
