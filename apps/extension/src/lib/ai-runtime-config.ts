/**
 * Tunable limits for AI requests, the prompt library, and the AI activity log, read once from
 * the [ai.limits] and [ai.activity] tables of config/settings.default.toml and validated here.
 */
import { parse } from 'smol-toml';
import { z } from 'zod';
import settingsToml from '../../config/settings.default.toml?raw';

const aiRuntimeConfigSchema = z.object({
  limits: z.object({
    model_list_timeout_ms: z.number().int().positive(),
    model_list_max_pages: z.number().int().positive(),
    model_list_page_size: z.number().int().positive(),
    anthropic_version: z.string().min(1),
    prompt_max_bytes: z.number().int().positive().max(8192),
  }),
  activity: z.object({
    max_entries: z.number().int().positive(),
    max_body_chars: z.number().int().positive(),
  }),
});

export type AIRuntimeConfig = z.infer<typeof aiRuntimeConfigSchema>;

/** Fails at load time when the config is missing a value, instead of at the first AI call. */
export const aiRuntimeConfig: AIRuntimeConfig = aiRuntimeConfigSchema.parse(
  (parse(settingsToml) as { ai?: unknown }).ai,
);
