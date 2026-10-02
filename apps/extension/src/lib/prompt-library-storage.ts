/**
 * The prompt library: any number of custom prompts per AI task, one of them active, synced
 * across devices through browser sync storage.
 *
 * Sync storage allows 8 KB per item, so each prompt is its own item, and a small index lists the
 * prompt ids and the active prompt per task. Prompts are written only when saved, never per
 * keystroke, which keeps clear of the sync write limits.
 */
import { useEffect, useState } from 'react';

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
export const MAX_PROMPT_BYTES = aiRuntimeConfig.limits.prompt_max_bytes;

const INDEX_KEY = 'sync:bookmark-scout-prompts' as const;
const promptKey = (id: string) => `sync:bookmark-scout-prompt-${id}` as const;

const indexItem = storage.defineItem<PromptLibraryIndex>(INDEX_KEY, {
  fallback: { ids: [], active: {} },
});

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
  const index = await indexItem.getValue();
  const stored = await Promise.all(
    index.ids.map((id) => storage.getItem<CustomPrompt>(promptKey(id))),
  );
  const prompts = stored.filter(
    (prompt): prompt is CustomPrompt => prompt !== null && prompt.task in PROMPT_TASKS,
  );
  const ids = new Set(prompts.map((prompt) => prompt.id));
  // An active id whose prompt is gone (deleted on another device) falls back to the default.
  const active = Object.fromEntries(
    Object.entries(index.active).filter(([, id]) => id && ids.has(id)),
  ) as PromptLibrary['active'];
  return { prompts, active };
}

/** Text of the task's active custom prompt, or undefined to use the built-in default. */
export async function getActivePromptText(task: PromptTaskId): Promise<string | undefined> {
  const id = (await indexItem.getValue()).active[task];
  if (!id) return undefined;
  const prompt = await storage.getItem<CustomPrompt>(promptKey(id));
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
  await storage.setItem(promptKey(saved.id), saved);
  const index = await indexItem.getValue();
  if (!index.ids.includes(saved.id)) {
    await indexItem.setValue({ ...index, ids: [...index.ids, saved.id] });
  }
  return saved;
}

/** Makes `id` the task's prompt; undefined goes back to the built-in default. */
export async function setActivePrompt(task: PromptTaskId, id: string | undefined): Promise<void> {
  const index = await indexItem.getValue();
  const active = { ...index.active };
  if (id) active[task] = id;
  else delete active[task];
  await indexItem.setValue({ ...index, active });
}

export async function deleteCustomPrompt(id: string): Promise<void> {
  const index = await indexItem.getValue();
  const active = Object.fromEntries(
    Object.entries(index.active).filter(([, activeId]) => activeId !== id),
  ) as PromptLibraryIndex['active'];
  await indexItem.setValue({ ids: index.ids.filter((promptId) => promptId !== id), active });
  await storage.removeItem(promptKey(id));
}

/** Live prompt library for React, following edits from any page or synced device. */
export function usePromptLibrary(): { library: PromptLibrary; isLoading: boolean } {
  const [library, setLibrary] = useState<PromptLibrary>({ prompts: [], active: {} });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unwatchPrompts: (() => void)[] = [];
    const refresh = async () => {
      const next = await getPromptLibrary();
      if (!active) return;
      setLibrary(next);
      setIsLoading(false);
      // Prompt items change on their own when edited, so each one is watched too.
      for (const unwatch of unwatchPrompts) unwatch();
      unwatchPrompts = next.prompts.map((prompt) =>
        storage.watch(promptKey(prompt.id), () => void refresh()),
      );
    };
    void refresh();
    const unwatchIndex = indexItem.watch(() => void refresh());
    return () => {
      active = false;
      unwatchIndex();
      for (const unwatch of unwatchPrompts) unwatch();
    };
  }, []);

  return { library, isLoading };
}
