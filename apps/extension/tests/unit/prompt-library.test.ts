import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  MAX_PROMPT_BYTES,
  PromptValidationError,
  deleteCustomPrompt,
  getPromptLibrary,
  promptByteLength,
  saveCustomPrompt,
  setActivePrompt,
} from '@/lib/prompt-library-storage';
import {
  PROMPT_TASKS,
  buildPrompt,
  findUnknownPromptVariables,
} from '@/services/prompt-config';

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

describe('prompt library', () => {
  it('uses the built-in prompt until a custom one is active', async () => {
    const { system } = await buildPrompt('auto_tagging', { minTags: 2, maxTags: 4, tagStyle: 'kebab-case' });
    expect(system).toContain('Suggest 2-4 tags per bookmark');

    const saved = await saveCustomPrompt({
      task: 'auto_tagging',
      name: 'Short tags',
      system: 'Use {{maxTags}} one-word tags at most.',
    });
    // Saved but not active yet: still the built-in prompt.
    expect((await buildPrompt('auto_tagging', { maxTags: 3 })).system).toContain(
      'Suggest {{minTags}}-3 tags',
    );
    await setActivePrompt('auto_tagging', saved.id);
    expect((await buildPrompt('auto_tagging', { maxTags: 3 })).system).toBe(
      'Use 3 one-word tags at most.',
    );
    await setActivePrompt('auto_tagging', undefined);
    expect((await buildPrompt('auto_tagging', { maxTags: 3 })).system).toBe(
      PROMPT_TASKS.auto_tagging.system.replace('{{maxTags}}', '3'),
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
    expect((await buildPrompt('summarization')).system).toBe(PROMPT_TASKS.summarization.system);
  });

  it('stores each prompt as its own sync item to stay under the per-item quota', async () => {
    const saved = await saveCustomPrompt({ task: 'auto_tagging', name: 'N', system: 'Text' });
    const stored = await fakeBrowser.storage.sync.get(null);
    expect(Object.keys(stored).sort()).toEqual([
      'bookmark-scout-prompt-' + saved.id,
      'bookmark-scout-prompts',
    ]);
  });

  it('measures size in UTF-8 bytes and rejects prompts too large to sync', async () => {
    expect(promptByteLength('あ')).toBe(3);
    const japanese = 'あ'.repeat(Math.floor(MAX_PROMPT_BYTES / 3) + 1);
    await expect(
      saveCustomPrompt({ task: 'auto_tagging', name: 'Long', system: japanese }),
    ).rejects.toBeInstanceOf(PromptValidationError);
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
