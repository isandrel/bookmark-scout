/**
 * The prompt library: any number of custom prompts per AI task, one of them active, synced
 * across devices through browser sync storage.
 *
 * Sync storage allows 8 KB per item, so each prompt is its own item, and a small index lists the
 * prompt ids and the active prompt per task. Prompts are written only when saved, never per
 * keystroke, which keeps clear of the sync write limits.
 */
import { useEffect, useState } from 'react';
import { z } from 'zod';

export type CustomPrompt = {
  id: string;
  task: PromptTaskId;
  name: string;
  system: string;
  updatedAt: number;
};

type PromptLibraryIndex = {
  /** Prompt ids in the order they were created. */
  ids: string[];
  /** The custom prompt in use per task; a task without one uses its default. */
  active: Partial<Record<PromptTaskId, string>>;
};

export type PromptLibrary = {
  prompts: CustomPrompt[];
  active: Partial<Record<PromptTaskId, string>>;
};

/**
 * Largest saved prompt, measured as sync storage measures an item (`syncItemBytes`), so a prompt
 * within it never hits the browser's 8,192-byte item quota.
 */
export const MAX_PROMPT_BYTES = readConfig(
  'ai/prompt-library',
  z.strictObject({ prompt_max_bytes: z.number().int().positive().max(8192) }),
).prompt_max_bytes;

const indexValue = defineStoredValue<PromptLibraryIndex>({
  key: STORAGE_KEYS.promptLibraryIndex,
  parse: (raw) => ({
    ids:
      isPlainObject(raw) && Array.isArray(raw.ids)
        ? raw.ids.filter((id): id is string => typeof id === 'string')
        : [],
    active:
      isPlainObject(raw) && isPlainObject(raw.active)
        ? (raw.active as PromptLibraryIndex['active'])
        : {},
  }),
  empty: { ids: [], active: {} },
});

function parseCustomPrompt(raw: unknown): CustomPrompt | null {
  return isPlainObject(raw) && typeof raw.task === 'string' && raw.task in PROMPT_TASKS
    ? (raw as CustomPrompt)
    : null;
}

const promptValues = new Map<string, StoredValue<CustomPrompt | null>>();

/** One sync item per prompt, so each stays under the per-item quota. */
function promptValue(id: string): StoredValue<CustomPrompt | null> {
  let value = promptValues.get(id);
  if (!value) {
    value = defineStoredValue<CustomPrompt | null>({
      key: `${STORAGE_KEYS.promptPrefix}${id}`,
      parse: parseCustomPrompt,
      empty: null,
      isEmpty: (prompt) => prompt === null,
    });
    promptValues.set(id, value);
  }
  return value;
}

/** Characters Chrome's JSON writer escapes as `\uXXXX` although JSON.stringify keeps them. */
const CHROME_ESCAPED_CHARS = /[<\u2028\u2029]/g;
const ESCAPE_LENGTH = '\\u003C'.length;

/**
 * Bytes sync storage counts for one item: the key plus the value's JSON in UTF-8. Quotes and
 * backslashes take 2 bytes, Japanese or Korean text 3 a character, and `<` 6, because Chrome
 * escapes it (and the line and paragraph separators) as `\uXXXX`.
 */
export function syncItemBytes(key: string, value: unknown): number {
  const json = JSON.stringify(value) ?? '';
  const escapes = [...json.matchAll(CHROME_ESCAPED_CHARS)].reduce(
    (extra, [char]) => extra + ESCAPE_LENGTH - new TextEncoder().encode(char).length,
    0,
  );
  return new TextEncoder().encode(key + json).length + escapes;
}

/** A prompt being edited: not saved yet when it has no id. */
export type CustomPromptDraft = Pick<CustomPrompt, 'task' | 'name' | 'system'> & { id?: string };

function newPromptId(): string {
  return crypto.randomUUID().slice(0, 12);
}

/** The item a draft is stored as; `updatedAt` is the time of the save. */
function toStoredPrompt(draft: CustomPromptDraft, id: string, updatedAt: number): CustomPrompt {
  return { id, task: draft.task, name: draft.name.trim(), system: draft.system, updatedAt };
}

/** Sync storage key of a prompt item, without the `sync:` area prefix. */
function promptSyncKey(id: string): string {
  return `${STORAGE_KEYS.promptPrefix}${id}`.replace(/^sync:/, '');
}

/**
 * Bytes the prompt takes in sync storage once saved, as the browser counts them. A new prompt is
 * measured with an id of the length it will get.
 */
export function customPromptBytes(draft: CustomPromptDraft): number {
  const id = draft.id ?? 'x'.repeat(newPromptId().length);
  return syncItemBytes(promptSyncKey(id), toStoredPrompt(draft, id, Date.now()));
}

export class PromptValidationError extends Error {}

export function validateCustomPrompt(draft: CustomPromptDraft): string | undefined {
  if (!draft.name.trim()) return t('prompt_errorNameRequired');
  if (!draft.system.trim()) return t('prompt_errorTextRequired');
  if (customPromptBytes(draft) > MAX_PROMPT_BYTES) {
    return t('prompt_errorTooLong', formatKilobytes(MAX_PROMPT_BYTES));
  }
  return undefined;
}

export async function getPromptLibrary(): Promise<PromptLibrary> {
  const index = await indexValue.get();
  const stored = await Promise.all(index.ids.map((id) => promptValue(id).get()));
  const prompts = stored.filter((prompt): prompt is CustomPrompt => prompt !== null);
  const ids = new Set(prompts.map((prompt) => prompt.id));
  // An active id whose prompt is gone (deleted on another device) falls back to the default.
  const active = Object.fromEntries(
    Object.entries(index.active).filter(([, id]) => id && ids.has(id)),
  ) as PromptLibrary['active'];
  return { prompts, active };
}

/** Text of the task's active custom prompt, or undefined to use the built-in default. */
export async function getActivePromptText(task: PromptTaskId): Promise<string | undefined> {
  const id = (await indexValue.get()).active[task];
  if (!id) return undefined;
  const prompt = await promptValue(id).get();
  return prompt?.task === task && prompt.system.trim() ? prompt.system : undefined;
}

/**
 * Creates or updates a prompt. Throws PromptValidationError when it cannot be saved; a failed
 * storage write rejects with the browser's own error.
 */
export async function saveCustomPrompt(prompt: CustomPromptDraft): Promise<CustomPrompt> {
  const id = prompt.id ?? newPromptId();
  const error = validateCustomPrompt({ ...prompt, id });
  if (error) throw new PromptValidationError(error);
  const saved = toStoredPrompt(prompt, id, Date.now());
  await promptValue(saved.id).set(saved);
  await indexValue.update((index) =>
    index.ids.includes(saved.id) ? index : { ...index, ids: [...index.ids, saved.id] },
  );
  return saved;
}

/** Makes `id` the task's prompt; undefined goes back to the built-in default. */
export async function setActivePrompt(task: PromptTaskId, id: string | undefined): Promise<void> {
  await indexValue.update((index) => {
    const active = { ...index.active };
    if (id) active[task] = id;
    else delete active[task];
    return { ...index, active };
  });
}

export async function deleteCustomPrompt(id: string): Promise<void> {
  await indexValue.update((index) => ({
    ids: index.ids.filter((promptId) => promptId !== id),
    active: Object.fromEntries(
      Object.entries(index.active).filter(([, activeId]) => activeId !== id),
    ) as PromptLibraryIndex['active'],
  }));
  await promptValue(id).clear();
}

/**
 * Live prompt library for React, following edits from any page or synced device. Only the latest
 * refresh is applied, so a slow earlier read never replaces a newer one.
 */
export function usePromptLibrary(): { library: PromptLibrary; isLoading: boolean } {
  const [library, setLibrary] = useState<PromptLibrary>({ prompts: [], active: {} });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let latest = 0;
    let unwatchPrompts: (() => void)[] = [];
    const refresh = async () => {
      const request = ++latest;
      const next = await getPromptLibrary();
      if (!active || request !== latest) return;
      setLibrary(next);
      setIsLoading(false);
      // Prompt items change on their own when edited, so each one is watched too.
      for (const unwatch of unwatchPrompts) unwatch();
      unwatchPrompts = next.prompts.map((prompt) =>
        promptValue(prompt.id).watch(() => void refresh()),
      );
    };
    void refresh();
    const unwatchIndex = indexValue.watch(() => void refresh());
    return () => {
      active = false;
      unwatchIndex();
      for (const unwatch of unwatchPrompts) unwatch();
    };
  }, []);

  return { library, isLoading };
}
