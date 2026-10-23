import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A non-null object that is not an array, such as parsed JSON or stored data. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Marks text cut short by `truncateText`. */
export const ELLIPSIS = '...';

/** `text` cut to `maxChars` characters plus an ellipsis, or unchanged when it fits. */
export function truncateText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}${ELLIPSIS}` : text;
}

/** Equal when both serialize to the same JSON; key order counts, as in stored settings. */
export function isSameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The SHA-256 digest of `text` (as UTF-8), in lowercase hex: a fingerprint that names no secret. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byteToHex).join('');
}
