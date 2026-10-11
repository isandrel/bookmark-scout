/**
 * Opt-in log of AI requests for debugging: the last few calls to AI providers with their
 * request and response bodies. Requests carry bookmark titles and URLs, so recording is off by
 * default, the log stays on this device, and credentials are redacted before anything is stored.
 */

import { z } from 'zod';

const entrySchema = z.object({
  id: z.string(),
  at: z.number(),
  /** What made the call, such as a tool; see AI_ACTIVITY_SOURCES. */
  source: z.string(),
  /** The local AI agent that made the call, by the name it gave itself (not verified). */
  client: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  method: z.string(),
  url: z.string(),
  status: z.number().optional(),
  durationMs: z.number(),
  requestHeaders: z.record(z.string(), z.unknown()),
  requestBody: z.string().optional(),
  responseBody: z.string().optional(),
  /** Characters cut from the end of each body to stay within the configured cap. */
  requestBodyOmitted: z.number().optional(),
  responseBodyOmitted: z.number().optional(),
  error: z.string().optional(),
});

export type AIActivityEntry = Omit<z.infer<typeof entrySchema>, 'source' | 'requestHeaders'> & {
  source: AIActivitySource;
  requestHeaders: Record<string, string>;
};

const activityConfig = readConfig(
  'ai/activity',
  z.strictObject({
    max_entries: z.number().int().positive(),
    max_body_chars: z.number().int().positive(),
  }),
);

/** How many recent calls are kept and how long each stored body may be, from the config. */
export const MAX_AI_ACTIVITY_ENTRIES = activityConfig.max_entries;
export const MAX_AI_ACTIVITY_BODY_CHARS = activityConfig.max_body_chars;

/**
 * Newest first, at most the configured count; a malformed entry is dropped on its own. Headers are
 * redacted again on every read, so an entry stored with a credential by mistake never reaches the
 * panel or its Copy output.
 */
export const aiActivityValue = defineStoredValue<AIActivityEntry[]>(STORAGE_ITEMS.aiActivity, {
  parse: (raw) =>
    parseValidList(raw, entrySchema)
      .slice(0, MAX_AI_ACTIVITY_ENTRIES)
      .map((entry) => ({
        ...entry,
        source: entry.source as AIActivitySource,
        requestHeaders: redactHeaderRecord(entry.requestHeaders),
      })),
  empty: [],
  isEmpty: (entries) => entries.length === 0,
});

/** Stored in place of a credential. */
export const REDACTED_VALUE = '[redacted]';

/**
 * Header names that look like they carry a credential (Authorization, X-Api-Key, X-Auth-Token,
 * CF-Access-Client-Secret, Ocp-Apim-Subscription-Key, Cookie, session ids, signatures); their
 * values are never stored.
 */
const CREDENTIAL_HEADER_PATTERN = /token|secret|key|auth|cookie|session|signature|password/i;

/**
 * Headers with every credential value replaced: names that match the credential pattern, plus
 * `secretNames` (any case), such as the extra headers the user configured, which can hold a
 * credential under any name.
 */
export function redactHeaders(
  headers: HeadersInit | undefined,
  secretNames: Iterable<string> = [],
): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    record[name] = value;
  });
  return redactHeaderRecord(record, secretNames);
}

function redactHeaderRecord(
  headers: Record<string, unknown>,
  secretNames: Iterable<string> = [],
): Record<string, string> {
  const secrets = new Set([...secretNames].map((name) => name.toLowerCase()));
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      secrets.has(name.toLowerCase()) || CREDENTIAL_HEADER_PATTERN.test(name)
        ? REDACTED_VALUE
        : String(value),
    ]),
  );
}

/** Query parameters some providers put API keys in; their values are never stored. */
const SECRET_QUERY_PARAMS = ['key', 'api_key', 'apikey'];

/** Removes API keys that some providers put in the query string. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of SECRET_QUERY_PARAMS) {
      if (parsed.searchParams.has(name)) parsed.searchParams.set(name, REDACTED_VALUE);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** A body cut to the configured cap, with how many characters were left out. */
export function truncateBody(body: string | undefined): { body?: string; omitted?: number } {
  if (body === undefined || body.length <= MAX_AI_ACTIVITY_BODY_CHARS) return { body };
  return {
    body: body.slice(0, MAX_AI_ACTIVITY_BODY_CHARS),
    omitted: body.length - MAX_AI_ACTIVITY_BODY_CHARS,
  };
}

/** Calls that finish together are queued, so none overwrites another. */
export async function recordAIActivity(entry: Omit<AIActivityEntry, 'id'>): Promise<void> {
  try {
    await aiActivityValue.update((entries) =>
      [{ ...entry, id: crypto.randomUUID() }, ...entries].slice(0, MAX_AI_ACTIVITY_ENTRIES),
    );
  } catch {
    // A full or unavailable storage area must never break the AI call itself.
  }
}

export function clearAIActivity(): Promise<void> {
  return aiActivityValue.clear();
}
