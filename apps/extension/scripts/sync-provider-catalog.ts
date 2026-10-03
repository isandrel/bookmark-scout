/**
 * Refreshes config/provider-catalog.json from the models.dev catalog (MIT,
 * https://github.com/sst/models.dev). Only providers the extension can call are kept: those that
 * speak the OpenAI or Anthropic protocol at a published base URL. The extension never contacts
 * models.dev at runtime; run this script and commit the result to update the list.
 *
 * Usage: bun run catalog:sync (from apps/extension)
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  AI_PROVIDERS_CONFIG_PATH,
  aiProviderFilesSchema,
} from '../src/lib/config/ai-provider-schema';
import { createConfigReader, loadAppConfig } from '../src/lib/config/loader';
import {
  type CatalogProvider,
  catalogIdSchema,
  catalogProviderSchema,
  providerCatalogSchema,
} from '../src/lib/config/provider-catalog-schema';

const SOURCE_URL = 'https://models.dev/api.json';
const CONFIG_DIR = path.resolve(import.meta.dir, '../config');
const OUTPUT = path.join(CONFIG_DIR, 'provider-catalog.json');
const LOGO_DIR = path.resolve(import.meta.dir, '../public/provider-logos');
const LOGO_URL = (id: string) => `https://models.dev/logos/${id}.svg`;
/** Logos are one-color SVGs drawn as CSS masks; anything larger is not a simple logo. */
const MAX_LOGO_BYTES = 16_384;

/** models.dev logo ids named by `logo` in config/ai/providers/*.toml. */
async function providerFileLogoIds(): Promise<string[]> {
  const dir = path.join(CONFIG_DIR, AI_PROVIDERS_CONFIG_PATH);
  const names = (await readdir(dir)).filter((name) => name.endsWith('.toml'));
  const files = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        `${AI_PROVIDERS_CONFIG_PATH}/${name}`,
        await readFile(path.join(dir, name), 'utf8'),
      ]),
    ),
  );
  const providers = createConfigReader(loadAppConfig(files)).read(
    AI_PROVIDERS_CONFIG_PATH,
    aiProviderFilesSchema,
  );
  return Object.values(providers).flatMap((provider) => (provider.logo ? [provider.logo] : []));
}

/** AI SDK packages whose protocol the extension can speak against any base URL. */
const PROTOCOL_BY_PACKAGE: Record<string, CatalogProtocol> = {
  '@ai-sdk/openai-compatible': 'openai',
  '@ai-sdk/openai': 'openai',
  '@ai-sdk/anthropic': 'anthropic',
};

type CatalogProtocol = 'openai' | 'anthropic';

/**
 * OpenAI-compatible endpoints of providers that models.dev lists only under their own AI SDK
 * package, without a base URL. Each comes from the provider's OpenAI compatibility docs.
 */
const OPENAI_COMPATIBLE_ENDPOINTS: Record<string, string> = {
  togetherai: 'https://api.together.xyz/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
};

/** The fields read from each models.dev entry; everything else is dropped. */
const modelsDevProviderSchema = z.object({
  name: z.string().optional(),
  api: z.string().optional(),
  doc: z.string().optional(),
  npm: z.string().optional(),
});

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Probed 2026-10-02 with an invalid key (see the AI provider PR): these answered from a dead
 * domain, a down origin, or a redirect to another site, so they are left out.
 */
const UNAVAILABLE_PROVIDERS = new Set(['clarifai', 'neosmith', 'modelis', 'crof']);

/** Probed 2026-10-02: these serve no model list at /models, so Verify uses a test prompt. */
const NO_MODEL_LIST = new Set([
  'bailing',
  'iflowcn',
  'kuae-cloud-coding-plan',
  'oci',
  'thinkingmachines',
]);

/** Base URLs with account placeholders such as ${ACCOUNT_ID} need a user-specific address. */
const hasPlaceholder = (value: string) => /\$\{|%7B/i.test(value);

const isLocal = (value: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`models.dev answered ${response.status}`);
// models.dev is untrusted input: ids become file names and every value is written to the repo, so
// each entry is validated and anything that does not fit the catalog schema is skipped.
const source = z.record(z.string(), z.unknown()).parse(await response.json());
const skipped: string[] = [];

const providers: Record<string, CatalogProvider> = {};
for (const id of Object.keys(source).sort()) {
  const parsedEntry = modelsDevProviderSchema.safeParse(source[id]);
  if (!catalogIdSchema.safeParse(id).success || !parsedEntry.success) {
    skipped.push(id);
    continue;
  }
  const entry = { ...parsedEntry.data };
  if (!entry.api && OPENAI_COMPATIBLE_ENDPOINTS[id]) {
    entry.api = OPENAI_COMPATIBLE_ENDPOINTS[id];
    entry.npm = '@ai-sdk/openai-compatible';
  }
  const protocol = entry.npm ? PROTOCOL_BY_PACKAGE[entry.npm] : undefined;
  if (!protocol || !entry.api || !isHttpUrl(entry.api) || !entry.name) continue;
  if (hasPlaceholder(entry.api) || UNAVAILABLE_PROVIDERS.has(id)) continue;
  const candidate = catalogProviderSchema.safeParse({
    name: entry.name,
    // Local addresses are written as localhost, never 127.0.0.1.
    base_url: entry.api.replace(/\/+$/, '').replace('://127.0.0.1', '://localhost'),
    ...(entry.doc && isHttpUrl(entry.doc) ? { doc: entry.doc } : {}),
    protocol,
    requires_api_key: !isLocal(entry.api),
    ...(NO_MODEL_LIST.has(id) ? { model_list: 'none' as const } : {}),
  });
  if (candidate.success) providers[id] = candidate.data;
  else skipped.push(id);
}

/** Keeps only path geometry: no scripts, event handlers, links, or embedded images. */
function sanitizeLogo(svg: string): string | null {
  if (!svg.trimStart().startsWith('<svg') || svg.length > MAX_LOGO_BYTES) return null;
  if (/<(script|foreignObject|image|use|a)\b|\son\w+=|javascript:|href=/i.test(svg)) return null;
  return svg;
}

/** The logo file for an id, or null if the id is not a safe file name inside LOGO_DIR. */
function logoPath(id: string): string | null {
  if (!catalogIdSchema.safeParse(id).success) return null;
  const file = path.resolve(LOGO_DIR, `${id}.svg`);
  return path.dirname(file) === LOGO_DIR ? file : null;
}

async function downloadLogos(ids: string[]): Promise<string[]> {
  await rm(LOGO_DIR, { recursive: true, force: true });
  await mkdir(LOGO_DIR, { recursive: true });
  // models.dev answers unknown ids with a generic placeholder; a provider showing it has no logo.
  const placeholder = await fetch(LOGO_URL('bookmark-scout-unknown-provider'))
    .then((placeholderResponse) => (placeholderResponse.ok ? placeholderResponse.text() : ''))
    .catch(() => '');
  const saved: string[] = [];
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const file = logoPath(id);
        if (!file) continue;
        const logoResponse = await fetch(LOGO_URL(id)).catch(() => null);
        if (!logoResponse?.ok) continue;
        const text = await logoResponse.text();
        if (placeholder && text === placeholder) continue;
        const logo = sanitizeLogo(text);
        if (!logo) continue;
        await writeFile(file, logo);
        saved.push(id);
      }
    }),
  );
  return saved.sort();
}

const logos = await downloadLogos([
  ...new Set([...(await providerFileLogoIds()), ...Object.keys(providers)]),
]);
const logoFiles = await readdir(LOGO_DIR);

// The same schema the extension validates the bundled file with on load.
const output = providerCatalogSchema.parse({
  source: 'https://models.dev (MIT License, https://github.com/sst/models.dev)',
  logos,
  providers,
});
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
if (skipped.length) {
  console.warn(`Skipped ${skipped.length} entries that failed validation: ${skipped.join(', ')}`);
}
console.log(
  `Wrote ${Object.keys(providers).length} providers and ${logoFiles.length} logos to ${path.relative(process.cwd(), OUTPUT)}`,
);
