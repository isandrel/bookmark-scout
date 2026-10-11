/**
 * Parsing stored collections entry by entry, so one malformed entry (written by a bug, a newer
 * release, or edited by hand) is dropped on its own instead of emptying the whole collection.
 */
import type { z } from 'zod';

/** The entries of `raw` that pass `schema`; anything but an array reads as none. */
export function parseValidList<T>(raw: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The values of `raw` that pass `schema`, by key; anything but a plain object reads as none. */
export function parseValidRecord<T>(raw: unknown, schema: z.ZodType<T>): Record<string, T> {
  if (!isPlainObject(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const parsed = schema.safeParse(value);
      return parsed.success ? [[key, parsed.data]] : [];
    }),
  );
}
