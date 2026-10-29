/**
 * `perf.toml`, parsed once and checked strictly. Read by the harness, the scenarios, and the
 * base-versus-head comparison, which runs outside Playwright and so cannot import the harness.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { z } from 'zod';

const directory = path.dirname(fileURLToPath(import.meta.url));

const perfConfigSchema = z.strictObject({
  library: z.strictObject({
    areas: z.number().int().positive(),
    topics_per_area: z.number().int().positive(),
    pages_per_topic: z.number().int().nonnegative(),
    url_base: z.url(),
  }),
  run: z.strictObject({
    cpu_throttle: z.number().min(1),
    ci_cpu_throttle: z.number().min(1),
    repeats: z.number().int().positive(),
    scroll_steps: z.number().int().positive(),
    scroll_step_px: z.number().int().positive(),
    long_frame_ms: z.number().positive(),
  }),
  jobs: z.strictObject({
    repeats: z.number().int().positive(),
    pause_after_items: z.number().int().positive(),
    concurrency: z.number().int().positive(),
  }),
  search: z.strictObject({
    queries: z.record(z.string(), z.string().min(1)),
  }),
  page_text: z.strictObject({
    pages: z.number().int().positive(),
    chars_per_page: z.number().int().positive(),
    words: z.array(z.string().min(1)).min(2),
    rare_word: z.string().min(1),
    rare_every: z.number().int().positive(),
    queries: z.record(z.string(), z.string().min(1)),
  }),
  rules: z.strictObject({
    list: z
      .array(
        z.strictObject({
          query: z.string().min(1),
          add_tags: z.array(z.string().min(1)).default([]),
          move_to: z.string().min(1).optional(),
        }),
      )
      .min(1),
  }),
  /** Upper bounds for the median of each metric, in milliseconds; a metric without one is only reported. */
  budgets_ms: z.record(z.string(), z.number().positive()),
  compare: z.strictObject({
    default_base: z.string().min(1),
    rounds: z.number().int().positive(),
    rounds_by_file: z.record(z.string().regex(/\.perf\.spec\.ts$/), z.number().int().positive()),
    confirm_rounds: z.number().int().nonnegative(),
    max_ratio: z.number().gt(1),
    min_delta: z.record(z.string(), z.number().nonnegative()),
    max_p_value: z.number().gt(0).lt(1),
    min_samples: z.number().int().min(2),
    base_checkout_dir: z.string().min(1),
  }),
});

export type PerfConfig = z.infer<typeof perfConfigSchema>;

/** The `[compare]` table: when head counts as slower than base (`compare-results.ts`). */
export type CompareSettings = PerfConfig['compare'];

export const perfConfig: PerfConfig = perfConfigSchema.parse(
  parse(readFileSync(path.join(directory, 'perf.toml'), 'utf8')),
);
