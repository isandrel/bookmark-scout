import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeDeadLink } from '@/components/bookmarks/ToolResultViews';
import { setLanguage } from '@/hooks/use-i18n';

beforeAll(() => setLanguage('en'));
afterAll(() => setLanguage('auto'));

const item = (changes: Partial<DeadLinkResultItem>): DeadLinkResultItem => ({
  id: '1',
  title: 'Docs',
  url: 'https://www.example.com/docs',
  folderPath: '',
  status: 'redirect',
  ...changes,
});

describe('describeDeadLink', () => {
  it('says a redirect stays on the same site when the target is on it', () => {
    expect(describeDeadLink(item({ redirectUrl: 'https://docs.example.com/start' }))).toBe(
      'Redirects to https://docs.example.com/start on the same site',
    );
    expect(describeDeadLink(item({ redirectUrl: 'https://example.org/docs' }))).toBe(
      'Redirects to https://example.org/docs',
    );
  });

  it('does not claim another site for a redirect it could not follow', () => {
    const text = describeDeadLink(
      item({ status: 'error', errorKind: 'redirect', category: 'redirectElsewhere' }),
    );
    expect(text).toBe('Redirects somewhere this check could not follow; open it to confirm');
  });
});
