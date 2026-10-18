import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  SUPPORTED_LOCALES,
  formatKilobytes,
  getLanguageName,
  setLanguage,
} from '@/hooks/use-i18n';
import {
  MAX_PROMPT_BYTES,
  MAX_PROMPTS,
  PromptValidationError,
  customPromptBytes,
  deleteCustomPrompt,
  getPromptLibrary,
  registerPromptCleanup,
  removeOrphanPrompts,
  saveCustomPrompt,
  setActivePrompt,
  syncItemBytes,
  validateCustomPrompt,
} from '@/lib/prompt-library-storage';
import { type Settings, defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import { storageAreaKey } from '@/lib/storage/registry';
import {
  PROMPT_TASK_IDS,
  PROMPT_TASKS,
  buildPrompt,
  findUnknownPromptVariables,
  getPromptVariables,
  interpolatePrompt,
} from '@/services/prompt-config';
import { appRoot, readConfigToml } from '../config-files';
import { STORAGE_ITEMS, seedStored } from './storage-helpers';

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

const ONE_ITEM_RULE = 'Return exactly one item per bookmark and preserve bookmarkId/title exactly.';
const OUTPUT_RULE = (language: string) =>
  `Write all free text (summaries, reasons, new tag and folder names) in ${language}. Keep existing tags, folder names, proper nouns, and URLs exactly as written.`;
const tagging = {
  autoTaggingMinTags: 2,
  autoTaggingMaxTags: 3,
  autoTaggingTagStyle: 'kebab-case',
} as const;

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
    expect(plain.endsWith(`\n\n${ONE_ITEM_RULE}\n\n${OUTPUT_RULE('English')}`)).toBe(true);
    expect(plain).not.toContain('pageText');
    const withPages = (await buildPrompt('auto_tagging', tagging, { hasPageText: true })).system;
    expect(withPages).toContain(`${OUTPUT_RULE('English')}\n\nSome items include pageText`);
    expect(
      (await buildPrompt('folder_recommendation', { aiMaxRecommendations: 7 })).system,
    ).toContain('Return exactly 7 folder recommendations');
  });
});

describe('{{language}} placeholder', () => {
  const languageOf = (settings: Pick<Settings, 'aiOutputLanguage' | 'language'>) =>
    getPromptVariables('auto_tagging', { ...defaultSettings, ...settings }).language;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is offered to every task, after its own placeholders', () => {
    for (const taskId of PROMPT_TASK_IDS) {
      expect(PROMPT_TASKS[taskId].variables.at(-1), taskId).toEqual({
        name: 'language',
        descriptionKey: 'prompt_varLanguage',
      });
    }
  });

  it('names the extension language for auto, in English and in its own name', () => {
    expect(languageOf({ aiOutputLanguage: 'auto', language: 'ja' })).toBe('Japanese (日本語)');
    expect(languageOf({ aiOutputLanguage: 'auto', language: 'pt_BR' })).toBe(
      'Brazilian Portuguese (Português (Brasil))',
    );
    expect(languageOf({ aiOutputLanguage: 'auto', language: 'en' })).toBe('English');
    // Language on Browser setting follows the browser, as the extension's own text does.
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('zh-HK');
    expect(languageOf({ aiOutputLanguage: 'auto', language: 'auto' })).toBe(
      'Traditional Chinese (繁體中文)',
    );
  });

  it('names the chosen language whatever the extension language is', () => {
    const english = (readConfigToml('ai/prompts.toml') as { languages: Record<string, string> })
      .languages;
    expect(Object.keys(english).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    for (const locale of SUPPORTED_LOCALES) {
      const name = languageOf({ aiOutputLanguage: locale, language: 'de' });
      expect(name.startsWith(english[locale]), locale).toBe(true);
      expect(name, locale).toContain(getLanguageName(locale));
    }
    expect(languageOf({ aiOutputLanguage: 'zh_CN', language: 'en' })).toBe(
      'Simplified Chinese (简体中文)',
    );
  });

  it('asks for each page language in page mode, with the extension language as the fallback', () => {
    expect(languageOf({ aiOutputLanguage: 'page', language: 'ko' })).toBe(
      'the same language as each page or bookmark title (if unclear, Korean (한국어))',
    );
  });

  it('adds the output language rule to every tool prompt, custom ones too, from stored settings', async () => {
    await saveSettings({ language: 'ja' });
    const { aiOutputLanguage: _, language: __, ...taskSettings } = defaultSettings;
    for (const taskId of PROMPT_TASK_IDS.filter((id) => id !== 'ask_ai')) {
      const { system } = await buildPrompt(taskId, taskSettings);
      expect(system, taskId).toContain(`\n\n${OUTPUT_RULE('Japanese (日本語)')}`);
    }
    const saved = await saveCustomPrompt({
      task: 'auto_tagging',
      name: 'Language',
      system: 'Tags in {{language}}.',
    });
    await setActivePrompt('auto_tagging', saved.id);
    expect((await buildPrompt('auto_tagging', tagging)).system).toBe(
      `Tags in Japanese (日本語).\n\n${ONE_ITEM_RULE}\n\n${OUTPUT_RULE('Japanese (日本語)')}`,
    );
    // Settings a caller passes win over the stored ones.
    expect(
      (await buildPrompt('auto_tagging', { ...tagging, aiOutputLanguage: 'page' })).system,
    ).toContain('Tags in the same language as each page or bookmark title (if unclear, Japanese');
  });

  it('lets Ask AI follow the user, with the output language only as the fallback', async () => {
    const { system } = await buildPrompt('ask_ai', {
      aiOutputLanguage: 'fr',
      language: 'en',
    });
    expect(system).toContain(
      'Answer in the language the user writes in, unless they ask for another language. When that is unclear, answer in French (Français).',
    );
    expect(system).not.toContain('Write all free text');
  });
});

describe('prompt placeholders', () => {
  it('registers every placeholder the built-in prompts use', () => {
    for (const taskId of PROMPT_TASK_IDS) {
      expect(findUnknownPromptVariables(taskId, PROMPT_TASKS[taskId].system), taskId).toEqual([]);
    }
  });

  it('describes every placeholder in every language', () => {
    const keys = new Set(
      PROMPT_TASK_IDS.flatMap((id) => PROMPT_TASKS[id].variables.map((v) => v.descriptionKey)),
    );
    for (const locale of SUPPORTED_LOCALES) {
      const messages = JSON.parse(
        readFileSync(path.join(appRoot, 'public/_locales', locale, 'messages.json'), 'utf8'),
      ) as Record<string, { message: string }>;
      for (const key of keys) expect(messages[key]?.message, `${locale} ${key}`).toBeTruthy();
    }
  });

  it('fills placeholders in one pass, never inside a value it filled in', () => {
    expect(interpolatePrompt('{{a}} {{b}}', { a: '{{b}}', b: 'x' })).toBe('{{b}} x');
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
      `Use 3 one-word tags at most.\n\n${ONE_ITEM_RULE}\n\n${OUTPUT_RULE('English')}`,
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
      storageAreaKey(STORAGE_ITEMS.promptIndex),
      storageAreaKey(STORAGE_ITEMS.prompt, saved.id),
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
    const key = storageAreaKey(STORAGE_ITEMS.prompt, saved.id);
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

describe('prompt library storage', () => {
  const draft = (name: string) => ({ task: 'auto_tagging' as const, name, system: 'Text' });

  it('fits the most prompts at their largest, with the other synced items, in the sync quota', () => {
    // Settings, table view, and prompt index are capped at the 8,192-byte item quota each.
    const otherSyncedItems = Object.values(STORAGE_ITEMS).filter(
      (item) => item.area === 'sync' && !('collection' in item),
    );
    expect(otherSyncedItems).toHaveLength(3);
    expect(MAX_PROMPTS * MAX_PROMPT_BYTES + otherSyncedItems.length * 8192).toBeLessThanOrEqual(
      102_400,
    );
  });

  it('refuses a prompt past the limit and stores nothing for it', async () => {
    for (let index = 0; index < MAX_PROMPTS; index += 1) await saveCustomPrompt(draft(`P${index}`));
    await expect(saveCustomPrompt(draft('One too many'))).rejects.toThrow(
      `You can keep up to ${MAX_PROMPTS} custom prompts so they fit in browser sync. Delete one to add another.`,
    );
    const library = await getPromptLibrary();
    expect(library.prompts).toHaveLength(MAX_PROMPTS);
    expect(Object.keys(await fakeBrowser.storage.sync.get(null))).toHaveLength(MAX_PROMPTS + 1);
    // Editing a saved prompt is not adding one.
    await expect(
      saveCustomPrompt({ ...draft('Renamed'), id: library.prompts[0].id }),
    ).resolves.toMatchObject({ name: 'Renamed' });
  });

  it('reads every listed prompt in one storage call, in index order, skipping malformed ones', async () => {
    const first = await saveCustomPrompt(draft('First'));
    const second = await saveCustomPrompt(draft('Second'));
    await seedStored(STORAGE_ITEMS.prompt, { id: 'bad', task: 'no-such-task' }, 'bad');
    await seedStored(STORAGE_ITEMS.promptIndex, {
      ids: [second.id, 'bad', first.id, second.id, 7],
      active: { auto_tagging: first.id, unknown_task: second.id },
    });
    const get = vi.spyOn(fakeBrowser.storage.sync, 'get');
    const library = await getPromptLibrary();
    expect(get).toHaveBeenCalledTimes(2);
    expect(library.prompts.map((prompt) => prompt.name)).toEqual(['Second', 'First']);
    expect(library.active).toEqual({ auto_tagging: first.id });
  });

  it('removes unlisted prompts only once they are older than the grace period', async () => {
    const hour = 60 * 60 * 1000;
    const listed = await saveCustomPrompt(draft('Listed'));
    const prompt = (id: string, updatedAt: number) => ({
      id,
      task: 'auto_tagging',
      name: id,
      system: 'Text',
      updatedAt,
    });
    await seedStored(STORAGE_ITEMS.prompt, prompt('stale', 0), 'stale');
    await seedStored(STORAGE_ITEMS.prompt, prompt('arriving', 30 * hour), 'arriving');
    await seedStored(STORAGE_ITEMS.prompt, 'broken', 'broken');

    expect((await removeOrphanPrompts(36 * hour)).sort()).toEqual(['broken', 'stale']);
    expect(Object.keys(await fakeBrowser.storage.sync.get(null)).sort()).toEqual(
      [
        storageAreaKey(STORAGE_ITEMS.promptIndex),
        storageAreaKey(STORAGE_ITEMS.prompt, 'arriving'),
        storageAreaKey(STORAGE_ITEMS.prompt, listed.id),
      ].sort(),
    );
  });

  it('removes leftover prompts when the browser starts', async () => {
    registerPromptCleanup();
    await seedStored(
      STORAGE_ITEMS.prompt,
      { id: 'stale', task: 'auto_tagging', name: 'Stale', system: 'Text', updatedAt: 0 },
      'stale',
    );
    await fakeBrowser.runtime.onStartup.trigger();
    await vi.waitFor(async () => expect(await fakeBrowser.storage.sync.get(null)).toEqual({}));
  });
});
