/**
 * Opt-in log of AI requests for debugging: the last few calls to AI providers with their
 * request and response bodies. Requests carry bookmark titles and URLs, so recording is off by
 * default, the log stays on this device, and credentials are redacted before anything is stored.
 */
import { useEffect, useState } from 'react';
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

export const aiActivityItem = storage.defineItem<AIActivityEntry[]>('local:bookmark-scout-ai-activity', {
  fallback: [],
});

/** Per device: whether AI requests are recorded. */
export const aiActivityRecordingItem = storage.defineItem<boolean>(
  'local:bookmark-scout-ai-activity-recording',
  { fallback: false },
);

/** Stored in place of a credential. */
export const REDACTED_VALUE = '[redacted]';

/** Header names that carry credentials; their values are never stored. */
const SECRET_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-goog-api-key',
  'api-key',
  'proxy-authorization',
  'cookie',
]);

export function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const redacted: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    redacted[name] = SECRET_HEADERS.has(name.toLowerCase()) ? REDACTED_VALUE : value;
  });
  return redacted;
}

/** Removes API keys that some providers put in the query string. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of ['key', 'api_key', 'apikey']) {
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

/** Writes run one at a time, so calls that finish together never overwrite each other. */
let writeQueue: Promise<void> = Promise.resolve();

export function recordAIActivity(entry: Omit<AIActivityEntry, 'id'>): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      const entries = await aiActivityItem.getValue();
      const next = [{ ...entry, id: crypto.randomUUID() }, ...entries].slice(
        0,
        MAX_AI_ACTIVITY_ENTRIES,
      );
      await aiActivityItem.setValue(next);
    })
    .catch(() => {
      // A full or unavailable storage area must never break the AI call itself.
    });
  return writeQueue;
}

export async function clearAIActivity(): Promise<void> {
  await aiActivityItem.setValue([]);
}

/** Live log and recording switch for React, following calls made from any page. */
export function useAIActivity(): {
  entries: AIActivityEntry[];
  recording: boolean;
  setRecording: (recording: boolean) => Promise<void>;
} {
  const [entries, setEntries] = useState<AIActivityEntry[]>([]);
  const [recording, setRecordingState] = useState(false);

  useEffect(() => {
    let active = true;
    void aiActivityItem.getValue().then((value) => active && setEntries(value));
    void aiActivityRecordingItem.getValue().then((value) => active && setRecordingState(value));
    const unwatchEntries = aiActivityItem.watch((value) => active && setEntries(value ?? []));
    const unwatchRecording = aiActivityRecordingItem.watch(
      (value) => active && setRecordingState(Boolean(value)),
    );
    return () => {
      active = false;
      unwatchEntries();
      unwatchRecording();
    };
  }, []);

  return {
    entries,
    recording,
    setRecording: async (next: boolean) => {
      await aiActivityRecordingItem.setValue(next);
      // Turning recording off also drops what was recorded.
      if (!next) await clearAIActivity();
    },
  };
}
