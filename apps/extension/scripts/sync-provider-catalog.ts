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
import {
  AI_PROVIDERS_CONFIG_PATH,
  aiProviderFilesSchema,
} from '../src/lib/config/ai-provider-schema';
import { createConfigReader, loadAppConfig } from '../src/lib/config/loader';

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

type ModelsDevProvider = {
  id?: string;
  name?: string;
  api?: string;
  doc?: string;
  npm?: string;
};

export type CatalogProvider = {
  name: string;
  base_url: string;
  doc?: string;
  protocol: CatalogProtocol;
  requires_api_key: boolean;
  /** Omitted when the provider has an OpenAI- or Anthropic-style model list. */
  model_list?: 'none';
};

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
const source = (await response.json()) as Record<string, ModelsDevProvider>;

const providers: Record<string, CatalogProvider> = {};
for (const id of Object.keys(source).sort()) {
  const entry = { ...source[id] };
  if (!entry.api && OPENAI_COMPATIBLE_ENDPOINTS[id]) {
    entry.api = OPENAI_COMPATIBLE_ENDPOINTS[id];
    entry.npm = '@ai-sdk/openai-compatible';
  }
  const protocol = entry.npm ? PROTOCOL_BY_PACKAGE[entry.npm] : undefined;
  if (!protocol || !entry.api || !isHttpUrl(entry.api) || !entry.name) continue;
  if (hasPlaceholder(entry.api) || UNAVAILABLE_PROVIDERS.has(id)) continue;
  providers[id] = {
    name: entry.name,
    // Local addresses are written as localhost, never 127.0.0.1.
    base_url: entry.api.replace(/\/+$/, '').replace('://127.0.0.1', '://localhost'),
    ...(entry.doc && isHttpUrl(entry.doc) ? { doc: entry.doc } : {}),
    protocol,
    requires_api_key: !isLocal(entry.api),
    ...(NO_MODEL_LIST.has(id) ? { model_list: 'none' as const } : {}),
  };
}

/** Keeps only path geometry: no scripts, event handlers, links, or embedded images. */
function sanitizeLogo(svg: string): string | null {
  if (!svg.trimStart().startsWith('<svg') || svg.length > MAX_LOGO_BYTES) return null;
  if (/<(script|foreignObject|image|use|a)\b|\son\w+=|javascript:|href=/i.test(svg)) return null;
  return svg;
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
        const logoResponse = await fetch(LOGO_URL(id)).catch(() => null);
        if (!logoResponse?.ok) continue;
        const text = await logoResponse.text();
        if (placeholder && text === placeholder) continue;
        const logo = sanitizeLogo(text);
        if (!logo) continue;
        await writeFile(path.join(LOGO_DIR, `${id}.svg`), logo);
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

const output = {
  source: 'https://models.dev (MIT License, https://github.com/sst/models.dev)',
  /** Provider ids with a logo in public/provider-logos/. */
  logos,
  providers,
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(providers).length} providers and ${logoFiles.length} logos to ${path.relative(process.cwd(), OUTPUT)}`,
);
