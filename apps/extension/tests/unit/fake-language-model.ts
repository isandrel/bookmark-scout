/**
 * A stand-in for Chrome's Prompt API (`globalThis.LanguageModel`) in unit tests: availability,
 * sessions that answer with a fixed text or error, the download monitor, and a record of every
 * call. Install it with `installFakeLanguageModel` and remove it with `vi.unstubAllGlobals()`.
 */
import { vi } from 'vitest';

export type FakeLanguageModelOptions = {
  availability?: Availability;
  /** What every prompt answers, or the error it rejects with. */
  answer?: string | Error;
  /** What `create()` rejects with, such as Chrome's policy error. */
  createError?: Error;
  /** Download progress events `create()` reports to its monitor, each from 0 to 1. */
  progress?: number[];
};

export type FakeLanguageModel = {
  options: FakeLanguageModelOptions;
  creates: LanguageModelCreateOptions[];
  prompts: { input: LanguageModelPrompt; options?: LanguageModelPromptOptions }[];
  destroyed: number;
};

export function installFakeLanguageModel(
  options: FakeLanguageModelOptions = {},
): FakeLanguageModel {
  const fake: FakeLanguageModel = { options, creates: [], prompts: [], destroyed: 0 };
  const session = () => ({
    contextUsage: 120,
    contextWindow: 9216,
    async prompt(input: LanguageModelPrompt, promptOptions?: LanguageModelPromptOptions) {
      fake.prompts.push({ input, options: promptOptions });
      promptOptions?.signal?.throwIfAborted();
      const answer = fake.options.answer ?? '{"folders":[]}';
      if (answer instanceof Error) throw answer;
      return answer;
    },
    destroy() {
      fake.destroyed += 1;
    },
  });
  vi.stubGlobal('LanguageModel', {
    availability: vi.fn(async () => fake.options.availability ?? 'available'),
    create: vi.fn(async (createOptions: LanguageModelCreateOptions = {}) => {
      fake.creates.push(createOptions);
      if (fake.options.createError) throw fake.options.createError;
      if (createOptions.monitor) {
        const monitor = new EventTarget() as CreateMonitor;
        createOptions.monitor(monitor);
        for (const loaded of fake.options.progress ?? []) {
          monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded, total: 1 }));
        }
        fake.options.availability = 'available';
      }
      return session();
    }),
  });
  return fake;
}
