/**
 * Schema of config/provider-catalog.json, the models.dev snapshot. The sync script
 * (scripts/sync-provider-catalog.ts) validates with it before writing, and the extension
 * validates the bundled file with it on first use, so data fetched from the network reaches
 * neither the file system nor the provider picker unchecked. Pure zod so the Bun script can use
 * it; its limits are `config/ai/provider-catalog.toml`, which each caller reads and passes in.
 */
import { z } from 'zod';

/** Lowercase letters, digits, `.`, `_`, `-`: safe as an object key and as a file name. */
export const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const catalogIdSchema = z
  .string()
  .regex(CATALOG_ID_PATTERN)
  .refine((id) => !id.includes('..'), 'Catalog ids must not contain ".."');

const isSafeUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    // Plain HTTP is only for servers on this machine.
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
};

/** Where the catalog's limits are, under config/. */
export const PROVIDER_CATALOG_LIMITS_PATH = 'ai/provider-catalog';

export const providerCatalogLimitsSchema = z.strictObject({
  max_name_length: z.number().int().positive(),
  max_url_length: z.number().int().positive(),
});

export type ProviderCatalogLimits = z.infer<typeof providerCatalogLimitsSchema>;

/** The schemas of one catalog entry and of the whole file, within `limits`. */
export function createProviderCatalogSchemas(limits: ProviderCatalogLimits) {
  const catalogUrlSchema = z
    .string()
    .max(limits.max_url_length)
    .refine(isSafeUrl, 'Expected an https or local URL');

  const catalogProviderSchema = z.strictObject({
    // No control characters: the name is shown in the provider picker.
    name: z
      .string()
      .min(1)
      .max(limits.max_name_length)
      .regex(/^[^\p{Cc}]+$/u),
    base_url: catalogUrlSchema,
    doc: catalogUrlSchema.optional(),
    protocol: z.enum(['openai', 'anthropic']),
    requires_api_key: z.boolean(),
    /** Omitted when the provider has an OpenAI- or Anthropic-style model list. */
    model_list: z.literal('none').optional(),
  });

  const providerCatalogSchema = z.strictObject({
    source: z.string().min(1),
    /** Provider ids with a logo in public/provider-logos/. */
    logos: z.array(catalogIdSchema),
    providers: z.record(catalogIdSchema, catalogProviderSchema),
  });

  return { catalogProviderSchema, providerCatalogSchema };
}

type ProviderCatalogSchemas = ReturnType<typeof createProviderCatalogSchemas>;
export type CatalogProvider = z.infer<ProviderCatalogSchemas['catalogProviderSchema']>;
export type ProviderCatalog = z.infer<ProviderCatalogSchemas['providerCatalogSchema']>;
