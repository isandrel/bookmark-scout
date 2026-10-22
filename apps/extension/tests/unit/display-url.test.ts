import { describe, expect, it } from 'vitest';
import { formatDisplayUrl } from '@/lib/url-domain';

describe('formatDisplayUrl', () => {
  it('drops only the final slash, unless the setting shows it', () => {
    expect(formatDisplayUrl('https://chatgpt.com/', false)).toBe('https://chatgpt.com');
    expect(formatDisplayUrl('https://example.com/docs/', false)).toBe('https://example.com/docs');
    expect(formatDisplayUrl('chatgpt.com/', false)).toBe('chatgpt.com');
    expect(formatDisplayUrl('https://chatgpt.com/', true)).toBe('https://chatgpt.com/');
  });

  it('keeps a slash before a query or fragment, and addresses that do not end in one', () => {
    expect(formatDisplayUrl('https://example.com/?q=1', false)).toBe('https://example.com/?q=1');
    expect(formatDisplayUrl('https://example.com/#top/', false)).toBe('https://example.com/#top/');
    expect(formatDisplayUrl('https://example.com/a', false)).toBe('https://example.com/a');
  });
});
