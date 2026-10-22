import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeDeadLink } from '@/components/bookmarks/ToolResultViews';
import { setLanguage } from '@/hooks/use-i18n';
import { DEAD_LINK_GROUPS, deadLinkGroup } from '@/services/dead-link-repair';

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

describe('deadLinkGroup', () => {
  it('puts each result in one group, confirmed dead before its status', () => {
    expect(deadLinkGroup(item({ status: 'error', category: 'notFound' }))).toBe('dead');
    expect(deadLinkGroup(item({ status: 'error', category: 'auth' }))).toBe('check');
    expect(deadLinkGroup(item({ status: 'timeout' }))).toBe('check');
    expect(deadLinkGroup(item({ status: 'invalid' }))).toBe('check');
    expect(deadLinkGroup(item({ redirectUrl: 'https://example.org/' }))).toBe('redirect');
    expect(deadLinkGroup(item({ status: 'ok' }))).toBe('ok');
    expect(deadLinkGroup(item({ status: 'skipped' }))).toBe('skipped');
    expect(DEAD_LINK_GROUPS).toEqual(['dead', 'check', 'redirect', 'ok', 'skipped']);
  });
});
