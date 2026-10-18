/**
 * Chrome's built-in AI (the Prompt API's `LanguageModel`, Gemini Nano on this computer) without
 * the AI SDK: whether this browser has it, the model's state, and its one-time download. Prompts
 * run through the AI SDK adapter in builtin-ai-model.lazy.ts, and folder suggestions through
 * builtin-ai-folders.ts. Nothing here sends anything over the network: Chrome downloads the model
 * from Google itself, once, when the user clicks Download in Options.
 *
 * Firefox has no `LanguageModel`, so the provider stays hidden there (`unsupported`).
 */
import { z } from 'zod';

const MODEL_LANGUAGES = ['en', 'ja', 'es', 'de', 'fr'] as const;

export const builtinAIConfig = readConfig(
  'ai/built-in',
  z.strictObject({
    session_languages: z.array(z.enum(MODEL_LANGUAGES)).min(1),
    model_languages: z.array(z.enum(MODEL_LANGUAGES)).min(1),
    status_poll_ms: z.number().int().positive(),
    policy_error_pattern: z.string().min(1),
    folders: z.strictObject({
      candidates: z.number().int().min(1).max(100),
      page_excerpt_chars: z.number().int().min(0).max(10_000),
      timeout_ms: z.number().int().positive(),
      rank_weight: z.number().min(0).max(1),
      max_confidence: z.number().gt(0).max(1),
      system: z.string().min(1),
      prompt: z.string().min(1),
      text_line: z.string().min(1),
    }),
    quick_save: z.strictObject({
      idle_timeout_ms: z.number().int().positive(),
    }),
    requirements: z.strictObject({
      download_gb_gpu: z.number().positive(),
      download_gb_cpu: z.number().positive(),
      free_disk_gb: z.number().positive(),
      gpu_vram_gb: z.number().positive(),
      ram_gb: z.number().positive(),
      cpu_cores: z.number().int().positive(),
    }),
  }),
);

/**
 * The model's state: `unsupported` without the API (Firefox, older Chrome), then Chrome's own
 * `availability()`: `unavailable` (this computer cannot run it, or a policy turned it off),
 * `downloadable`, `downloading`, or `available`.
 */
export type BuiltinAIStatus = 'unsupported' | Availability;

/** Why the model is `unavailable`, for Options. */
export type BuiltinAIUnavailableReason = 'policy' | 'device';

/** One finished call to the model, for the AI activity log. */
export type BuiltinModelCall = {
  /** The system prompt and the conversation as the model read them. */
  input: string;
  output?: string;
  error?: string;
  durationMs: number;
};

/**
 * Opens the session for one call that starts from `system` alone, such as a copy of a warm session
 * (`createWarmBuiltinSessions`); without one, each call creates its own.
 */
export type BuiltinSessionOpener = (
  system: string,
  signal: AbortSignal | undefined,
) => Promise<LanguageModel>;

/** Thrown before any session is created when the model is not downloaded and ready. */
async function assertBuiltinModelReady(options: LanguageModelCreateCoreOptions): Promise<void> {
  if ((await LanguageModel.availability(options)) !== 'available') {
    throw new Error(t('builtinAi_errorNotReady'));
  }
}

/**
 * A new session for one call; fails without downloading anything when the model is not ready, so
 * no caller but the Options download button ever starts the multi-gigabyte download.
 */
export async function createBuiltinSession(
  initialPrompts: NonNullable<LanguageModelCreateOptions['initialPrompts']>,
  signal: AbortSignal | undefined,
): Promise<LanguageModel> {
  const options = builtinAISessionOptions();
  await assertBuiltinModelReady(options);
  return LanguageModel.create({ ...options, initialPrompts, signal });
}

/**
 * Warm sessions for AI quick save's host page: one base session with the instructions already
 * read, copied (`clone()`) for each call, so a save skips loading the model and the instructions.
 * A different system prompt replaces the base. After `idleMs` without a call the base is
 * destroyed and `onIdle` runs (the host page then asks to be closed).
 */
export function createWarmBuiltinSessions({
  idleMs,
  onIdle,
}: {
  idleMs: number;
  onIdle: () => void;
}): { open: BuiltinSessionOpener; dispose: () => void } {
  let warm: { system: string; base: Promise<LanguageModel> } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dropBase = () => {
    const old = warm;
    warm = undefined;
    void old?.base.then((session) => session.destroy()).catch(() => undefined);
  };
  const dispose = () => {
    clearTimeout(timer);
    timer = undefined;
    dropBase();
  };

  const open: BuiltinSessionOpener = async (system, signal) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      dispose();
      onIdle();
    }, idleMs);
    // The model may have been removed since the base was made: check before every copy.
    await assertBuiltinModelReady(builtinAISessionOptions());
    if (warm?.system !== system) {
      dropBase();
      const base = createBuiltinSession([{ role: 'system', content: system }], undefined);
      warm = { system, base };
      // A failed base is dropped, so the next call tries again.
      base.catch(() => {
        if (warm?.base === base) warm = undefined;
      });
    }
    return (await warm.base).clone({ signal });
  };

  return { open, dispose };
}

/**
 * The options every session is checked and created with: text in the configured languages.
 * Availability depends on them, so the check and the session always use the same ones.
 */
export function builtinAISessionOptions(): LanguageModelCreateCoreOptions {
  const expected: LanguageModelExpected[] = [
    { type: 'text', languages: [...builtinAIConfig.session_languages] },
  ];
  return { expectedInputs: expected, expectedOutputs: expected };
}

/** Whether this browser has the Prompt API at all (Chrome; not Firefox). */
export function hasBuiltinAI(): boolean {
  return 'LanguageModel' in globalThis;
}

/**
 * Whether the model understands a language (a tag such as `ko` or `pt-BR`, matched by its base
 * language) by `model_languages`; pages in any other language may fall back to the word match.
 */
export function builtinAIReadsLanguage(language: string): boolean {
  const base = language.split(/[-_]/)[0]?.toLowerCase() ?? '';
  return builtinAIConfig.model_languages.some((code) => code === base);
}

/** Whether the provider is worth offering: the API exists and the computer can run the model. */
export function canOfferBuiltinAI(status: BuiltinAIStatus | undefined): boolean {
  return status === 'downloadable' || status === 'downloading' || status === 'available';
}

let current: Promise<BuiltinAIStatus> | undefined;
const listeners = new Set<(status: BuiltinAIStatus) => void>();

async function readStatus(): Promise<BuiltinAIStatus> {
  if (!hasBuiltinAI()) return 'unsupported';
  try {
    return await LanguageModel.availability(builtinAISessionOptions());
  } catch {
    return 'unavailable';
  }
}

/** The state last read on this page, for a first render that cannot wait for a promise. */
let known: BuiltinAIStatus | undefined;

function publish(next: Promise<BuiltinAIStatus>): Promise<BuiltinAIStatus> {
  current = next;
  void next.then((status) => {
    if (current !== next) return;
    known = status;
    for (const listener of listeners) listener(status);
  });
  return next;
}

/** The model's state as last read on this page, `undefined` before the first read finishes. */
export function peekBuiltinAIStatus(): BuiltinAIStatus | undefined {
  return known;
}

/**
 * The model's state, read once per page and kept: the popup and Options ask on every render.
 * `refresh` reads it again (while it downloads, or after a download).
 */
export function getBuiltinAIStatus({ refresh = false } = {}): Promise<BuiltinAIStatus> {
  return !current || refresh ? publish(readStatus()) : current;
}

/** Calls `listener` with every new state this page reads. */
export function watchBuiltinAIStatus(listener: (status: BuiltinAIStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Why the model is unavailable: `availability()` says only "unavailable", but `create()` rejects
 * with a message naming the enterprise policy when an organization turned the model off. Call it
 * only while the state is `unavailable`, so no download can start.
 */
export async function getBuiltinAIUnavailableReason(): Promise<BuiltinAIUnavailableReason> {
  try {
    const session = await LanguageModel.create(builtinAISessionOptions());
    session.destroy();
  } catch (error) {
    const pattern = new RegExp(builtinAIConfig.policy_error_pattern, 'i');
    if (error instanceof Error && pattern.test(error.message)) return 'policy';
  }
  return 'device';
}

/**
 * Downloads the model and resolves once it is ready, reporting progress from 0 to 1. Chrome starts
 * a download only right after a click, so call it first in the click handler, before any `await`.
 * Only Options does: folder suggestions and quick save never start a download.
 */
export async function downloadBuiltinAIModel(
  onProgress: (fraction: number) => void,
): Promise<void> {
  const created = LanguageModel.create({
    ...builtinAISessionOptions(),
    monitor: (monitor) =>
      monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded)),
  });
  void publish(Promise.resolve('downloading'));
  try {
    (await created).destroy();
  } finally {
    await getBuiltinAIStatus({ refresh: true });
  }
}
