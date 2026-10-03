/**
 * Schema of a featured provider file, `config/ai/providers/<id>.toml` (the file name is the
 * provider id). Pure zod so scripts/sync-provider-catalog.ts can read the same files.
 */
import { z } from 'zod';

/** Directory of featured, local, and custom provider files. */
export const AI_PROVIDERS_CONFIG_PATH = 'ai/providers';

export const AI_PROVIDER_KINDS = [
  'native',
  'openai_compatible',
  'anthropic_compatible',
  'ollama',
] as const;

/** Shape of a provider's model-list endpoint. */
export const MODEL_LIST_STYLES = ['openai', 'anthropic', 'google', 'ollama', 'none'] as const;

/** Provider-specific connection settings beyond the API key, Base URL, and headers. */
export const AI_PROVIDER_EXTRA_FIELDS = [
  'organization',
  'project',
  'resourceName',
  'apiVersion',
] as const;

/** Picker groups for provider files; catalog providers are always `catalog`. */
export const AI_PROVIDER_FILE_GROUPS = ['featured', 'local', 'custom'] as const;

const aiModelSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const aiProviderFileSchema = z.strictObject({
  name: z.string().min(1),
  /** Position in the provider picker; lower comes first. */
  order: z.number().int(),
  /** Empty when the user must enter a model. */
  default_model: z.string(),
  provider_kind: z.enum(AI_PROVIDER_KINDS),
  requires_api_key: z.boolean(),
  api_key_pattern: z.string().optional(),
  /**
   * The key's format, such as "sk-...", shown as the placeholder. Never prose, which would not be
   * translated: without a format the editor shows a localized "Required" or "Optional".
   */
  api_key_placeholder: z
    .string()
    .regex(/^\S*\.\.\.$/, 'must be a key format ending in "...", such as "sk-..."')
    .optional(),
  base_url: z.url().optional(),
  supports_custom_model: z.boolean().optional(),
  /** `openai` when omitted. */
  model_list: z.enum(MODEL_LIST_STYLES).optional(),
  extra_fields: z.array(z.enum(AI_PROVIDER_EXTRA_FIELDS)).optional(),
  /** `featured` when omitted. */
  group: z.enum(AI_PROVIDER_FILE_GROUPS).optional(),
  /** models.dev logo id in public/provider-logos/, downloaded by `bun run catalog:sync`. */
  logo: z.string().min(1).optional(),
  models: z.array(aiModelSchema).default([]),
});

export const aiProviderFilesSchema = z
  .record(z.string(), aiProviderFileSchema)
  .superRefine((providers, ctx) => {
    const seen = new Map<number, string>();
    for (const [id, provider] of Object.entries(providers)) {
      const other = seen.get(provider.order);
      if (other !== undefined) {
        ctx.addIssue({ code: 'custom', path: [id, 'order'], message: `same order as ${other}` });
      }
      seen.set(provider.order, id);
    }
  });

export type AIProviderFile = z.output<typeof aiProviderFileSchema>;
