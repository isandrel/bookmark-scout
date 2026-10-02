/**
 * Refreshes config/provider-catalog.json from the models.dev catalog (MIT,
 * https://github.com/sst/models.dev). Only providers the extension can call are kept: those that
 * speak the OpenAI or Anthropic protocol at a published base URL. The extension never contacts
 * models.dev at runtime; run this script and commit the result to update the list.
 *
 * Usage: bun run catalog:sync (from apps/extension)
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL = 'https://models.dev/api.json';
const OUTPUT = path.resolve(import.meta.dir, '../config/provider-catalog.json');

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
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

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
  providers[id] = {
    name: entry.name,
    base_url: entry.api.replace(/\/+$/, ''),
    ...(entry.doc && isHttpUrl(entry.doc) ? { doc: entry.doc } : {}),
    protocol,
    requires_api_key: !isLocal(entry.api),
  };
}

const output = {
  source: 'https://models.dev (MIT License, https://github.com/sst/models.dev)',
  providers,
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${Object.keys(providers).length} providers to ${path.relative(process.cwd(), OUTPUT)}`);
