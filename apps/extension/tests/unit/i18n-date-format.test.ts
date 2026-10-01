import { afterEach, describe, expect, it } from 'vitest';
import { formatDateTime, setLanguage } from '@/hooks/use-i18n';

const SAMPLE = new Date(2026, 8, 24, 15, 5, 49);

afterEach(() => setLanguage('auto'));

describe('formatDateTime', () => {
  it('formats dates in the selected extension language', () => {
    setLanguage('ja');
    expect(formatDateTime(SAMPLE)).toBe('2026/9/24 15:05:49');
    setLanguage('ko');
    expect(formatDateTime(SAMPLE.getTime())).toMatch(/^2026\. 9\. 24\./);
    setLanguage('en');
    expect(formatDateTime(SAMPLE)).toBe('9/24/2026, 3:05:49 PM');
  });
});
