/**
 * Reads an HTTP `Retry-After` header (RFC 9110, section 10.2.3): a number of seconds, or a date.
 * Returns how long to wait from `now` in ms, or undefined when the header is missing or unreadable.
 */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text) * MS_PER_SECOND;
  // An HTTP date names its day and month; `Date.parse` alone also takes "-1" or "1.5" as years.
  const date = /[a-z]/i.test(text) ? Date.parse(text) : Number.NaN;
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
