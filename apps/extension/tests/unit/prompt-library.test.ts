import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { formatKilobytes, setLanguage } from '@/hooks/use-i18n';
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
import { defaultSettings } from '@/lib/settings-schema';
import { storageAreaKey } from '@/lib/storage/registry';
import {
  PROMPT_TASK_IDS,
  PROMPT_TASKS,
  buildPrompt,
  findUnknownPromptVariables,
  getPromptVariables,
} from '@/services/prompt-config';
import { STORAGE_ITEMS, seedStored } from './storage-helpers';

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

const ONE_ITEM_RULE = 'Return exactly one item per bookmark and preserve bookmarkId/title exactly.';
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
    expect(plain.endsWith(`\n\n${ONE_ITEM_RULE}`)).toBe(true);
    expect(plain).not.toContain('pageText');
    const withPages = (await buildPrompt('auto_tagging', tagging, { hasPageText: true })).system;
    expect(withPages).toContain(`${ONE_ITEM_RULE}\n\nSome items include pageText`);
    expect(
      (await buildPrompt('folder_recommendation', { aiMaxRecommendations: 7 })).system,
    ).toContain('Return exactly 7 folder recommendations');
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
