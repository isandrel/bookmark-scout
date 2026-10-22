import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSearchDocuments, searchDocuments } from '@/lib/search-documents';
import { parseSearchQuery } from '@/lib/search-query';
import type { BookmarkTreeNode } from '@/types';

// `after:` and `before:` take local calendar days, so these tests pin a zone with daylight saving
// time. Node rereads the zone whenever `process.env.TZ` is assigned.
const ZONE = 'America/New_York';
const previousZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = ZONE;
});

afterAll(() => {
  if (previousZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousZone;
});

/** In 2026, New York moves its clocks forward on 8 March and back on 1 November. */
const added: Record<string, string> = {
  // 8 March has 23 hours: midnight is EST (UTC-5), the next midnight EDT (UTC-4).
  'march-start': '2026-03-08T05:00:00Z', // 00:00 EST
  'march-after-jump': '2026-03-08T07:30:00Z', // 03:30 EDT
  'march-end': '2026-03-09T03:59:00Z', // 23:59 EDT
  'march-next': '2026-03-09T04:30:00Z', // 9 March 00:30 EDT, inside 24 hours of 8 March's start
  // 1 November has 25 hours, and 01:30 happens twice.
  'november-first-0130': '2026-11-01T05:30:00Z', // 01:30 EDT
  'november-second-0130': '2026-11-01T06:30:00Z', // 01:30 EST
  'november-late': '2026-11-02T04:30:00Z', // 23:30 EST, past 24 hours from 1 November's start
  'november-next': '2026-11-02T05:00:00Z', // 2 November 00:00 EST
};

function documents() {
  const children: BookmarkTreeNode[] = Object.entries(added).map(([id, iso]) => ({
    id,
    parentId: '1',
    title: id,
    url: `https://${id}.test/`,
    dateAdded: Date.parse(iso),
  }));
  return buildSearchDocuments(
    [{ id: '0', title: '', children: [{ id: '1', parentId: '0', title: 'Bar', children }] }],
    {},
  );
}

function find(query: string): string[] {
  return searchDocuments(documents(), parseSearchQuery(query).query)
    .map((result) => result.document.id)
    .sort();
}

describe('date operators across a daylight saving change (U14)', () => {
  it('runs in a zone whose offset changes on those days', () => {
    expect(new Date(2026, 2, 8).getTimezoneOffset()).not.toBe(
      new Date(2026, 2, 9).getTimezoneOffset(),
    );
    expect(new Date(2026, 10, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 10, 2).getTimezoneOffset(),
    );
  });

  it('gives the 23-hour spring day exactly its own bookmarks, from local midnight to midnight', () => {
    expect(find('after:2026-03-08 before:2026-03-08')).toEqual([
      'march-after-jump',
      'march-end',
      'march-start',
    ]);
    expect(find('before:2026-03-07')).toEqual([]);
    expect(find('after:2026-03-09 before:2026-03-09')).toEqual(['march-next']);
  });

  it('gives the 25-hour autumn day both 01:30s and its last hour', () => {
    expect(find('after:2026-11-01 before:2026-11-01')).toEqual([
      'november-first-0130',
      'november-late',
      'november-second-0130',
    ]);
    expect(find('after:2026-11-02')).toEqual(['november-next']);
    expect(find('-before:2026-11-01 before:2026-11-02')).toEqual(['november-next']);
  });

  it('reports a day that does not exist and keeps searching with the rest', () => {
    const parsed = parseSearchQuery('after:2026-02-29 march');
    expect(parsed.diagnostics).toEqual([{ code: 'invalid-date', value: '2026-02-29' }]);
    expect(
      searchDocuments(documents(), parsed.query)
        .map((result) => result.document.id)
        .sort(),
    ).toEqual(['march-after-jump', 'march-end', 'march-next', 'march-start']);
  });
});
