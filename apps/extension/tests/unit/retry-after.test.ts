import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from '@/lib/retry-after';

const now = Date.parse('2026-10-21T12:00:00Z');

describe('Retry-After', () => {
  it('reads seconds and dates, and nothing else', () => {
    expect(parseRetryAfter('5', now)).toBe(5000);
    expect(parseRetryAfter(' 0 ', now)).toBe(0);
    expect(parseRetryAfter('Wed, 21 Oct 2026 12:00:07 GMT', now)).toBe(7000);
    // A date already past means now.
    expect(parseRetryAfter('Wed, 21 Oct 2026 11:00:00 GMT', now)).toBe(0);
    for (const unreadable of [null, '', 'soon', '-1', '1.5', '5s']) {
      expect(parseRetryAfter(unreadable, now)).toBeUndefined();
    }
  });
});
