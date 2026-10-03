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

/** Leaves room under sync's 8,192-byte item quota for the key and the other fields. */
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

/** UTF-8 size, which is what sync storage counts; Japanese or Korean text uses 3 bytes a char. */
export function promptByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export class PromptValidationError extends Error {}

export function validateCustomPrompt(name: string, system: string): string | undefined {
  if (!name.trim()) return t('prompt_errorNameRequired');
  if (!system.trim()) return t('prompt_errorTextRequired');
  if (promptByteLength(system) > MAX_PROMPT_BYTES) {
    return t('prompt_errorTooLong', String(MAX_PROMPT_BYTES));
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

function newPromptId(): string {
  return crypto.randomUUID().slice(0, 12);
}

/** Creates or updates a prompt. Throws PromptValidationError when it cannot be saved. */
export async function saveCustomPrompt(
  prompt: Omit<CustomPrompt, 'id' | 'updatedAt'> & { id?: string },
): Promise<CustomPrompt> {
  const error = validateCustomPrompt(prompt.name, prompt.system);
  if (error) throw new PromptValidationError(error);
  const saved: CustomPrompt = {
    id: prompt.id ?? newPromptId(),
    task: prompt.task,
    name: prompt.name.trim(),
    system: prompt.system,
    updatedAt: Date.now(),
  };
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
