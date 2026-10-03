/**
 * Opt-in log of AI requests for debugging: the last few calls to AI providers with their
 * request and response bodies. Requests carry bookmark titles and URLs, so recording is off by
 * default, the log stays on this device, and credentials are redacted before anything is stored.
 */

import { z } from 'zod';

export type AIActivityEntry = {
  id: string;
  at: number;
  /** What made the call, such as a tool; see AI_ACTIVITY_SOURCES. */
  source: AIActivitySource;
  provider?: string;
  model?: string;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  /** Characters cut from the end of each body to stay within the configured cap. */
  requestBodyOmitted?: number;
  responseBodyOmitted?: number;
  error?: string;
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
 * Newest first; only this extension writes it. Headers are redacted again on every read, so an
 * entry an older release stored with a credential never reaches the panel or its Copy output.
 */
export const aiActivityValue = defineStoredValue<AIActivityEntry[]>({
  key: STORAGE_KEYS.aiActivity,
  parse: (raw) =>
    Array.isArray(raw)
      ? (raw as AIActivityEntry[]).map((entry) => ({
          ...entry,
          requestHeaders: redactHeaderRecord(
            isPlainObject(entry.requestHeaders) ? entry.requestHeaders : {},
          ),
        }))
      : [],
  empty: [],
});

/** Per device: whether AI requests are recorded. */
export const aiActivityRecordingValue = defineStoredValue<boolean>({
  key: STORAGE_KEYS.aiActivityRecording,
  parse: (raw) => raw === true,
  empty: false,
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

/** Live log and recording switch for React, following calls made from any page. */
export function useAIActivity(): {
  entries: AIActivityEntry[];
  recording: boolean;
  setRecording: (recording: boolean) => Promise<void>;
} {
  const { value: entries } = useStoredValue(aiActivityValue);
  const { value: recording } = useStoredValue(aiActivityRecordingValue);
  return {
    entries,
    recording,
    setRecording: async (next: boolean) => {
      await aiActivityRecordingValue.set(next);
      // Turning recording off also drops what was recorded.
      if (!next) await clearAIActivity();
    },
  };
}
