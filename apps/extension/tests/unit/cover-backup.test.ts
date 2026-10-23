import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { type CoverInfo, clearCovers, getCoverInfos, restoreCoverRecords } from '@/lib/cover-store';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import { INDEXED_DATABASES } from '@/lib/storage/registry';
import { BYTES_PER_MB } from '@/lib/units';
import { exportBackup, getBackupCovers, readBackupFile, restoreBackup } from '@/services/backup';
import {
  applyCoverRestore,
  type BackupCoverEntry,
  type BookmarkAddress,
  COVER_BACKUP_LIMITS,
  coverUrlKey,
  importedCoverWins,
  planCoverRestore,
  previewCoverRestore,
  readBackupCovers,
  selectBackupCovers,
} from '@/services/cover-backup.lazy';
import { installFakeBookmarks } from '../fake-bookmarks';
import { pngHeader } from './png-header';

const WIDTH = 320;
const HEIGHT = 180;
const png = () => pngHeader(WIDTH, HEIGHT);
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const DAY = 86_400_000;

/** A stored cover as the store keeps it, with its own date and source. */
function stored(
  bookmarkId: string,
  url: string,
  source: CoverInfo['source'],
  savedAt: number,
  bytes = png(),
) {
  return {
    info: {
      bookmarkId,
      url,
      width: WIDTH,
      height: HEIGHT,
      bytes: bytes.byteLength,
      savedAt,
      version: 1,
      source,
    },
    image: { bookmarkId, type: 'image/png', data: bytes.slice().buffer },
  };
}

/** One cover entry of a backup file. */
function entry(url: string, overrides: Partial<BackupCoverEntry> = {}): BackupCoverEntry {
  const bytes = png();
  return {
    url,
    source: 'page',
    savedAt: new Date(10 * DAY).toISOString(),
    version: 1,
    type: 'image/png',
    width: WIDTH,
    height: HEIGHT,
    bytes: bytes.byteLength,
    data: base64(bytes),
    ...overrides,
  };
}

const address = (id: string, url: string): BookmarkAddress => ({ id, url, key: coverUrlKey(url) });

beforeEach(async () => {
  fakeBrowser.reset();
  await clearCovers();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  // The decoded picture is the size its header states.
  vi.stubGlobal('createImageBitmap', async () => ({
    width: WIDTH,
    height: HEIGHT,
    close: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('covers in the backup file', () => {
  it('are in the backup policy and fit a full Cover Storage at its default', () => {
    expect(INDEXED_DATABASES.covers.backup).toBe('include');
    expect(COVER_BACKUP_LIMITS.maxTotalBytes).toBeGreaterThanOrEqual(
      defaultSettings.coversMaxCacheMb * BYTES_PER_MB,
    );
  });

  it('are written one per address, keyed by URL, with image, source, date, and size; none without Include covers', async () => {
    installFakeBookmarks([
      { id: 'a', title: 'A', url: 'https://site.example/a' },
      { id: 'a2', title: 'A again', url: 'https://site.example/a' },
      { id: 'moved', title: 'Moved', url: 'https://site.example/now' },
      { id: 'plain', title: 'Plain', url: 'https://site.example/plain' },
    ]);
    await restoreCoverRecords(
      [
        // Two covers of one address: the one the user picked wins over a newer page image.
        stored('a', 'https://site.example/a', 'tab', 1 * DAY),
        stored('a2', 'https://site.example/a', 'page', 2 * DAY),
        // A cover of the bookmark's old address is not shown, so it is not backed up.
        stored('moved', 'https://site.example/before', 'page', 3 * DAY),
        // A bookmark that is gone takes its cover with it.
        stored('gone', 'https://site.example/gone', 'page', 4 * DAY),
      ],
      BYTES_PER_MB,
    );

    const without = JSON.parse(await exportBackup(new Date(0)));
    expect(without).not.toHaveProperty('covers');
    expect(
      JSON.parse(await exportBackup(new Date(0), { includeCovers: false })),
    ).not.toHaveProperty('covers');

    const file = JSON.parse(await exportBackup(new Date(0), { includeCovers: true }));
    expect(file.covers).toEqual([
      {
        url: 'https://site.example/a',
        source: 'tab',
        savedAt: new Date(DAY).toISOString(),
        version: 1,
        type: 'image/png',
        width: WIDTH,
        height: HEIGHT,
        bytes: png().byteLength,
        data: base64(png()),
      },
    ]);
  });

  it('come back on another computer matched by address, whatever the bookmark ids', async () => {
    installFakeBookmarks([
      { id: 'a', title: 'A', url: 'https://site.example/a' },
      { id: 'b', title: 'B', url: 'https://site.example/b' },
      { id: 'old', title: 'Old', url: 'https://site.example/old' },
    ]);
    await restoreCoverRecords(
      [
        stored('a', 'https://site.example/a', 'tab', 1 * DAY),
        stored('b', 'https://site.example/b', 'browse', 2 * DAY),
        stored('old', 'https://site.example/old', 'unknown', 3 * DAY),
      ],
      BYTES_PER_MB,
    );
    const json = await exportBackup(new Date(0), { includeCovers: true });

    // A new computer: other ids, an address spelled with another case, one bookmark missing.
    fakeBrowser.reset();
    await clearCovers();
    await saveSettings({ language: 'en' });
    installFakeBookmarks([
      { id: '101', title: 'A', url: 'HTTPS://SITE.example/a' },
      { id: '102', title: 'A in another folder', url: 'https://site.example/a' },
      { id: '103', title: 'Old', url: 'https://site.example/old' },
    ]);
    const file = readBackupFile(json);
    if (!file) throw new Error('not a backup');
    await restoreBackup(file);
    const covers = await getBackupCovers(file);
    if (!covers) throw new Error('no covers');
    expect(await previewCoverRestore(covers)).toMatchObject({
      inFile: 3,
      skipped: 0,
      matched: 2,
      unmatched: 1,
      added: 3,
      replaced: 0,
      kept: 0,
    });

    expect(await applyCoverRestore(covers)).toEqual({
      restored: 3,
      notStored: 0,
      kept: 0,
      unmatched: 1,
      skipped: 0,
    });
    const infos = await getCoverInfos();
    // Stored under each bookmark's own spelling, so the cover store's exact match finds it.
    expect(infos.get('101')).toMatchObject({
      url: 'HTTPS://SITE.example/a',
      source: 'tab',
      savedAt: DAY,
    });
    expect(infos.get('102')).toMatchObject({ url: 'https://site.example/a', source: 'tab' });
    // A cover saved before sources were recorded stays without one.
    expect(infos.get('103')).toMatchObject({ source: 'unknown', savedAt: 3 * DAY });

    // Restoring the same file again changes nothing.
    expect(await previewCoverRestore(covers)).toMatchObject({ added: 0, replaced: 0, kept: 3 });
  });

  it('rank a picked cover first: never replaced unless by a newer picked one, and replacing any other (media review 11)', () => {
    const at = (source: CoverInfo['source'], day: number) => ({ source, savedAt: day * DAY });
    expect(importedCoverWins(at('page', 5), at('tab', 1))).toBe(false);
    expect(importedCoverWins(at('browse', 5), at('tab', 1))).toBe(false);
    expect(importedCoverWins(at('tab', 5), at('tab', 1))).toBe(true);
    expect(importedCoverWins(at('tab', 1), at('tab', 5))).toBe(false);
    expect(importedCoverWins(at('page', 5), at('browse', 1))).toBe(true);
    expect(importedCoverWins(at('page', 1), at('browse', 5))).toBe(false);
    // A picked cover in the file wins over one that was not picked, however much newer.
    expect(importedCoverWins(at('tab', 1), at('page', 5))).toBe(true);
    expect(importedCoverWins(at('tab', 1), at('quickSave', 9))).toBe(true);
    expect(importedCoverWins(at('page', 1), at('page', 1))).toBe(false);

    const file = readBackupCovers([
      entry('https://site.example/picked', {
        source: 'page',
        savedAt: new Date(9 * DAY).toISOString(),
      }),
      entry('https://site.example/older', { savedAt: new Date(1 * DAY).toISOString() }),
      entry('https://site.example/newer', { savedAt: new Date(9 * DAY).toISOString() }),
      entry('https://site.example/moved', { savedAt: new Date(1 * DAY).toISOString() }),
    ]);
    const info = (bookmarkId: string, url: string, source: CoverInfo['source'], day: number) =>
      [bookmarkId, { ...stored(bookmarkId, url, source, day * DAY).info }] as const;
    const plan = planCoverRestore(
      file,
      [
        address('p', 'https://site.example/picked'),
        address('o', 'https://site.example/older'),
        address('n', 'https://site.example/newer'),
        address('m', 'https://site.example/moved'),
      ],
      new Map([
        info('p', 'https://site.example/picked', 'tab', 2),
        info('o', 'https://site.example/older', 'page', 5),
        info('n', 'https://site.example/newer', 'browse', 5),
        // A cover of another address is not shown: the file's cover takes its place.
        info('m', 'https://site.example/elsewhere', 'tab', 5),
      ]),
      BYTES_PER_MB,
    );
    expect(plan).toMatchObject({ matched: 4, unmatched: 0, added: 1, replaced: 1, kept: 2 });
    expect(plan.writes.map((write) => write.bookmarkId)).toEqual(['n', 'm']);
  });

  it('read a date in the future as now, so it neither outranks later covers nor outlasts them (media review 11)', () => {
    const now = Date.now();
    const file = readBackupCovers([
      entry('https://site.example/future', { savedAt: new Date(now + 400 * DAY).toISOString() }),
      entry('https://site.example/past', { savedAt: new Date(2 * DAY).toISOString() }),
    ]);
    const byUrl = new Map(file.covers.map((cover) => [cover.url, cover.savedAt]));
    expect(byUrl.get('https://site.example/future')).toBeGreaterThanOrEqual(now);
    expect(byUrl.get('https://site.example/future')).toBeLessThanOrEqual(Date.now());
    expect(byUrl.get('https://site.example/past')).toBe(2 * DAY);
    // A cover saved here after the restore is newer than the file's.
    expect(
      importedCoverWins(
        { source: 'page', savedAt: byUrl.get('https://site.example/future') ?? 0 },
        { source: 'page', savedAt: Date.now() + 1 },
      ),
    ).toBe(false);
  });

  it('count the covers Cover Storage would remove afterwards, the oldest first', () => {
    const size = png().byteLength;
    const file = readBackupCovers([
      entry('https://site.example/new', { savedAt: new Date(9 * DAY).toISOString() }),
      entry('https://site.example/old', { savedAt: new Date(1 * DAY).toISOString() }),
    ]);
    const plan = planCoverRestore(
      file,
      [address('n', 'https://site.example/new'), address('o', 'https://site.example/old')],
      new Map([['here', stored('here', 'https://site.example/here', 'page', 5 * DAY).info]]),
      size * 2,
    );
    expect(plan.overStorage).toBe(1);
  });

  it('drop each invalid entry alone and keep the better of two for one address', () => {
    const gif = Uint8Array.from([...'GIF89a'].map((char) => char.charCodeAt(0)));
    const file = readBackupCovers([
      entry('https://site.example/good'),
      entry('https://site.example/twice', { savedAt: new Date(1 * DAY).toISOString() }),
      entry('https://site.example/twice', { savedAt: new Date(2 * DAY).toISOString() }),
      'not an object',
      entry('https://site.example/bad-base64', { data: '%%%' }),
      entry('https://site.example/wrong-size', { bytes: png().byteLength + 1 }),
      entry('https://site.example/wrong-type', { type: 'image/webp' }),
      entry('https://site.example/not-image', { data: base64(gif), bytes: gif.byteLength }),
      entry('https://site.example/wrong-width', { width: WIDTH + 1 }),
      entry('https://site.example/source', { source: 'robot' as 'page' }),
      entry('https://site.example/date', { savedAt: 'yesterday' }),
      entry('https://site.example/huge', { bytes: COVER_BACKUP_LIMITS.maxImageBytes + 1 }),
      { ...entry('https://site.example/missing'), url: undefined },
    ]);
    expect(file.covers.map((cover) => cover.url)).toEqual([
      'https://site.example/good',
      'https://site.example/twice',
    ]);
    expect(file.covers[1]?.savedAt).toBe(2 * DAY);
    expect(file).toMatchObject({ inFile: 13, skipped: 11 });
  });

  it('read at most max_covers entries from a file', () => {
    const one = entry('https://site.example/');
    const raw = Array.from({ length: COVER_BACKUP_LIMITS.maxCovers + 2 }, (_, index) => ({
      ...one,
      url: `https://site.example/${index}`,
    }));
    const file = readBackupCovers(raw);
    expect(file.covers).toHaveLength(COVER_BACKUP_LIMITS.maxCovers);
    expect(file.skipped).toBe(2);
  });

  it('written newest first within max_covers, max_image_kb, and max_total_mb', () => {
    const info = (id: string, bytes: number, day: number): CoverInfo => ({
      ...stored(id, `https://site.example/${id}`, 'page', day * DAY).info,
      bytes,
    });
    // Images at the largest size fill max_total_mb before max_covers; one more is left out.
    const fill = Math.floor(COVER_BACKUP_LIMITS.maxTotalBytes / COVER_BACKUP_LIMITS.maxImageBytes);
    const full = Array.from({ length: fill + 1 }, (_, index) =>
      info(`f${index}`, COVER_BACKUP_LIMITS.maxImageBytes, index + 1),
    );
    const big = info('big', COVER_BACKUP_LIMITS.maxImageBytes + 1, fill + 2);
    const { selected, leftOut } = selectBackupCovers(
      [...full, big],
      [...full, big].map((cover) => address(cover.bookmarkId, cover.url)),
    );
    expect(selected).toHaveLength(fill);
    // The oldest goes, and the image past max_image_kb.
    expect(selected.map((cover) => cover.bookmarkId)).not.toContain('f0');
    expect(selected.map((cover) => cover.bookmarkId)).not.toContain('big');
    expect(leftOut).toBe(2);

    const many = Array.from({ length: COVER_BACKUP_LIMITS.maxCovers + 1 }, (_, index) =>
      info(String(index), 1, index),
    );
    const counted = selectBackupCovers(
      many,
      many.map((cover) => address(cover.bookmarkId, cover.url)),
    );
    expect(counted.selected).toHaveLength(COVER_BACKUP_LIMITS.maxCovers);
    expect(counted.leftOut).toBe(1);
    // The newest are kept.
    expect(counted.selected.some((cover) => cover.bookmarkId === '0')).toBe(false);
  });

  it('leave out an image the browser cannot decode, and restore the rest', async () => {
    installFakeBookmarks([
      { id: 'a', title: 'A', url: 'https://site.example/a' },
      { id: 'b', title: 'B', url: 'https://site.example/b' },
    ]);
    let calls = 0;
    vi.stubGlobal('createImageBitmap', async () => {
      calls += 1;
      if (calls === 1) throw new Error('cannot decode');
      return { width: WIDTH, height: HEIGHT, close: () => undefined };
    });
    const file = readBackupCovers([
      entry('https://site.example/a'),
      entry('https://site.example/b'),
    ]);
    expect(await applyCoverRestore(file)).toEqual({
      restored: 1,
      notStored: 0,
      kept: 0,
      unmatched: 0,
      skipped: 1,
    });
    expect((await getCoverInfos()).size).toBe(1);
  });
});
