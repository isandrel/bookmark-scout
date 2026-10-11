/**
 * The prompt library: custom prompts per AI task, one of them active, synced across devices
 * through browser sync storage.
 *
 * Sync storage allows 8 KB per item and 100 KB in all, so each prompt is its own item, a small
 * index lists the prompt ids and the active prompt per task, and the number of prompts is capped.
 * Prompts are written only when saved, never per keystroke, which keeps clear of the sync write
 * limits. A prompt is written before the index lists it and removed after the index drops it, so
 * a prompt the index does not list is either arriving from another device or left over from a
 * failed write; leftovers older than a grace period are removed (`removeOrphanPrompts`).
 */
import { z } from 'zod';

const customPromptSchema = z.object({
  id: z.string().min(1),
  // Checked when parsed: prompt-config imports this module, so its task list is not ready yet.
  task: z.custom<PromptTaskId>((task) => typeof task === 'string' && task in PROMPT_TASKS),
  name: z.string(),
  system: z.string(),
  updatedAt: z.number().finite(),
});

export type CustomPrompt = z.infer<typeof customPromptSchema>;

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

const promptLibraryConfig = readConfig(
  'ai/prompt-library',
  z.strictObject({
    prompt_max_bytes: z.number().int().positive().max(8192),
    max_prompts: z.number().int().positive(),
    orphan_grace_hours: z.number().positive(),
  }),
);

/**
 * Largest saved prompt, measured as sync storage measures an item (`syncItemBytes`), so a prompt
 * within it never hits the browser's 8,192-byte item quota.
 */
export const MAX_PROMPT_BYTES = promptLibraryConfig.prompt_max_bytes;

/** Most custom prompts in all, so that with the other synced items they fit the 100 KB quota. */
export const MAX_PROMPTS = promptLibraryConfig.max_prompts;

const ORPHAN_GRACE_MS = promptLibraryConfig.orphan_grace_hours * 60 * 60 * 1000;

const indexSchema = z.object({
  ids: z.array(z.unknown()),
  active: z.record(z.string(), z.unknown()),
});

/** Unknown tasks, repeated ids, and anything that is not an id are dropped. */
function parseIndex(raw: unknown): PromptLibraryIndex {
  const parsed = indexSchema.safeParse(raw);
  if (!parsed.success) return { ids: [], active: {} };
  const ids = [
    ...new Set(parsed.data.ids.filter((id): id is string => typeof id === 'string' && id !== '')),
  ];
  const active = Object.fromEntries(
    Object.entries(parsed.data.active).filter(
      ([task, id]) => task in PROMPT_TASKS && typeof id === 'string' && id !== '',
    ),
  ) as PromptLibraryIndex['active'];
  return { ids, active };
}

export const promptLibraryIndexValue = defineStoredValue<PromptLibraryIndex>(
  STORAGE_ITEMS.promptIndex,
  {
    parse: parseIndex,
    empty: { ids: [], active: {} },
    isEmpty: (index) => index.ids.length === 0 && Object.keys(index.active).length === 0,
  },
);

/** One sync item per prompt, so each stays under the per-item quota. */
const promptItems = defineStoredCollection<CustomPrompt | null>(STORAGE_ITEMS.prompt, {
  parse: (raw) => {
    const parsed = customPromptSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },
  empty: null,
  isEmpty: (prompt) => prompt === null,
});

const promptValue = (id: string) => promptItems.entry(id);

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

/**
 * Bytes the prompt takes in sync storage once saved, as the browser counts them. A new prompt is
 * measured with an id of the length it will get.
 */
export function customPromptBytes(draft: CustomPromptDraft): number {
  const id = draft.id ?? 'x'.repeat(newPromptId().length);
  return syncItemBytes(
    storageAreaKey(STORAGE_ITEMS.prompt, id),
    toStoredEnvelope(STORAGE_ITEMS.prompt, toStoredPrompt(draft, id, Date.now())),
  );
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
  const index = await promptLibraryIndexValue.get();
  // Every listed prompt in one storage read.
  const stored = await promptItems.getMany(index.ids);
  const prompts = index.ids
    .map((id) => stored[id])
    .filter((prompt): prompt is CustomPrompt => prompt !== null && prompt !== undefined);
  const ids = new Set(prompts.map((prompt) => prompt.id));
  // An active id whose prompt is gone (deleted on another device) falls back to the default.
  const active = Object.fromEntries(
    Object.entries(index.active).filter(([, id]) => id && ids.has(id)),
  ) as PromptLibrary['active'];
  return { prompts, active };
}

/** Text of the task's active custom prompt, or undefined to use the built-in default. */
export async function getActivePromptText(task: PromptTaskId): Promise<string | undefined> {
  const id = (await promptLibraryIndexValue.get()).active[task];
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
  const limitError = () => new PromptValidationError(t('prompt_errorLimit', String(MAX_PROMPTS)));
  const isNew = !(await promptLibraryIndexValue.get()).ids.includes(id);
  if (isNew && (await promptLibraryIndexValue.get()).ids.length >= MAX_PROMPTS) throw limitError();

  const saved = toStoredPrompt(prompt, id, Date.now());
  await promptValue(saved.id).set(saved);
  try {
    await promptLibraryIndexValue.update((index) => {
      if (index.ids.includes(saved.id)) return index;
      // Another page may have added prompts since the check above.
      if (index.ids.length >= MAX_PROMPTS) throw limitError();
      return { ...index, ids: [...index.ids, saved.id] };
    });
  } catch (indexError) {
    if (isNew) await promptValue(saved.id).clear();
    throw indexError;
  }
  return saved;
}

/** Makes `id` the task's prompt; undefined goes back to the built-in default. */
export async function setActivePrompt(task: PromptTaskId, id: string | undefined): Promise<void> {
  await promptLibraryIndexValue.update((index) => {
    const active = { ...index.active };
    if (id) active[task] = id;
    else delete active[task];
    return { ...index, active };
  });
}

export async function deleteCustomPrompt(id: string): Promise<void> {
  await promptLibraryIndexValue.update((index) => ({
    ids: index.ids.filter((promptId) => promptId !== id),
    active: Object.fromEntries(
      Object.entries(index.active).filter(([, activeId]) => activeId !== id),
    ) as PromptLibraryIndex['active'],
  }));
  await promptValue(id).clear();
}

/**
 * Removes prompts the index does not list that were saved more than the configured grace period
 * ago: left over from a write that stopped halfway. A younger one may be a prompt another device
 * saved whose index has not synced yet, so it stays. Resolves to the removed ids.
 */
export async function removeOrphanPrompts(now = Date.now()): Promise<string[]> {
  const listed = new Set((await promptLibraryIndexValue.get()).ids);
  const unlisted = (await promptItems.listIds()).filter((id) => !listed.has(id));
  const stored = await promptItems.getMany(unlisted);
  const orphans = unlisted.filter((id) => {
    const prompt = stored[id];
    return !prompt || now - prompt.updatedAt > ORPHAN_GRACE_MS;
  });
  for (const id of orphans) await promptValue(id).clear();
  return orphans;
}

/** Background: removes leftover prompts each time the browser starts. Call once at startup. */
export function registerPromptCleanup(): void {
  browser.runtime.onStartup.addListener(() => {
    void removeOrphanPrompts().catch((error) => {
      aiLogger.error({ error }, 'Failed to remove leftover prompts');
    });
  });
}

/**
 * Calls back with the library after every edit from any page or synced device, and returns the
 * unwatch function. Only the latest read is delivered, so a slow earlier read never replaces a
 * newer one.
 */
export function watchPromptLibrary(listener: (library: PromptLibrary) => void): () => void {
  let active = true;
  let latest = 0;
  let unwatchPrompts: (() => void)[] = [];
  const refresh = async () => {
    const request = ++latest;
    const next = await getPromptLibrary();
    if (!active || request !== latest) return;
    listener(next);
    // Prompt items change on their own when edited, so each one is watched too.
    for (const unwatch of unwatchPrompts) unwatch();
    unwatchPrompts = next.prompts.map((prompt) =>
      promptValue(prompt.id).watch(() => void refresh()),
    );
  };
  void refresh();
  const unwatchIndex = promptLibraryIndexValue.watch(() => void refresh());
  return () => {
    active = false;
    unwatchIndex();
    for (const unwatch of unwatchPrompts) unwatch();
  };
}
