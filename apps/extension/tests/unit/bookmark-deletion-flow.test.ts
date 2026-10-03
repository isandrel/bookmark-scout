import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { deleteBookmarksWithUndo } from '@/hooks/use-bookmark-deletion';
import { setLanguage } from '@/hooks/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { saveSettings } from '@/lib/settings-storage';
import { BOOKMARK_DELETION_UNDO_WINDOW_MS } from '@/services/bookmarks';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

/** The toasts as a component sees them right now, newest first. */
function currentToasts() {
  let toasts: ReturnType<typeof useToast>['toasts'] = [];
  function Probe() {
    toasts = useToast().toasts;
    return null;
  }
  renderToString(createElement(Probe));
  return toasts;
}

async function pressUndo(toast: ReturnType<typeof currentToasts>[number]) {
  const action = toast.action as ReactElement<{ onClick: () => void }>;
  action.props.onClick();
  // Undo runs asynchronously; let the restore and its toast settle.
  await vi.waitFor(() => expect(currentToasts()[0]).not.toBe(toast));
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  // Reading settings applies their language, so store English rather than only setting it.
  await saveSettings({ language: 'en' });
  setLanguage('en');
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 'b', parentId: 'f', title: 'B', url: 'https://e2e.invalid/b' },
    { id: 'c', parentId: 'f', title: 'C', url: 'https://e2e.invalid/c' },
    { id: 'd', parentId: 'f', title: 'D', url: 'https://e2e.invalid/d' },
    { id: 'e', parentId: 'f', title: 'E', url: 'https://e2e.invalid/e' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const target = (id: string, title = id.toUpperCase()) => ({ id, title, type: 'bookmark' as const });

describe('deleteBookmarksWithUndo', () => {
  it('deletes through the injected remove and offers Undo that restores the item in place', async () => {
    const onChanged = vi.fn();
    const remove = vi.fn((id: string) => browser.bookmarks.remove(id));

    expect(await deleteBookmarksWithUndo([target('b')], { onChanged, remove })).toEqual({
      deleted: 1,
      skipped: 0,
      failed: 0,
    });
    expect(remove).toHaveBeenCalledWith('b');
    expect(bookmarks.childIds('f')).toEqual(['a', 'c', 'd', 'e']);
    expect(onChanged).toHaveBeenCalledTimes(1);

    const [undo] = currentToasts();
    expect(undo).toMatchObject({
      title: '✓ Bookmark Deleted',
      description: 'Deleted "B". Undo within 10 seconds.',
      variant: 'success',
      duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
    });

    await pressUndo(undo);
    expect(bookmarks.childIds('f')).toHaveLength(5);
    expect(bookmarks.get(bookmarks.childIds('f')[1])?.title).toBe('B');
    expect(onChanged).toHaveBeenCalledTimes(2);
    // The restore is an outcome toast with the success mark, like every other one.
    expect(currentToasts()[0]).toMatchObject({
      title: '✓ Deletion undone',
      description: 'Restored "B".',
      variant: 'success',
    });
  });

  it('reports a failed restore as an error toast', async () => {
    await deleteBookmarksWithUndo([target('b')], { onChanged: vi.fn() });
    const [undo] = currentToasts();
    bookmarks.fail.create.add('B');

    await pressUndo(undo);
    expect(currentToasts()[0]).toMatchObject({
      title: '× Could not undo deletion',
      variant: 'destructive',
    });
  });

  it('keeps deleting past a failure and offers Undo for what was deleted', async () => {
    bookmarks.fail.remove.add('b');
    const outcome = await deleteBookmarksWithUndo([target('a'), target('b'), target('c')], {
      onChanged: vi.fn(),
    });

    expect(outcome).toEqual({ deleted: 2, skipped: 0, failed: 1 });
    expect(bookmarks.childIds('f')).toEqual(['b', 'd', 'e']);
    // One toast carries both the Undo and the counts, so the failure is never hidden.
    const [undo] = currentToasts();
    expect(undo).toMatchObject({
      title: '× 2 items deleted',
      description:
        'Deleted 2 items. Undo within 10 seconds. Skipped because they changed or were already deleted: 0. Failed: 1.',
      variant: 'destructive',
    });

    await pressUndo(undo);
    expect(bookmarks.childIds('f').map((id) => bookmarks.get(id)?.title)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });

  it('skips items deleted or changed since they were chosen and deletes the rest', async () => {
    await browser.bookmarks.remove('b');
    await browser.bookmarks.update('c', { title: 'C renamed' });
    const outcome = await deleteBookmarksWithUndo(
      [
        target('a'),
        target('b'),
        target('c'),
        { ...target('d'), url: 'https://e2e.invalid/d-old' },
        target('e'),
      ],
      { onChanged: vi.fn() },
    );

    expect(outcome).toEqual({ deleted: 2, skipped: 3, failed: 0 });
    // The renamed bookmark and the one whose URL changed are left alone.
    expect(bookmarks.childIds('f')).toEqual(['c', 'd']);
    expect(currentToasts()[0]).toMatchObject({
      title: '× 2 items deleted',
      description:
        'Deleted 2 items. Undo within 10 seconds. Skipped because they changed or were already deleted: 3. Failed: 0.',
    });
  });

  it('deletes nothing and says why when every item changed since it was chosen', async () => {
    await browser.bookmarks.remove('a');
    const outcome = await deleteBookmarksWithUndo([target('a')], { onChanged: vi.fn() });

    expect(outcome).toEqual({ deleted: 0, skipped: 1, failed: 0 });
    expect(bookmarks.childIds('f')).toEqual(['b', 'c', 'd', 'e']);
    expect(currentToasts()[0]).toMatchObject({
      title: '× Error Deleting Bookmark',
      description: 'Skipped because they changed or were already deleted: 1. Failed: 0.',
      variant: 'destructive',
    });
  });

  it('closes the Undo toast when the undo window ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    await deleteBookmarksWithUndo([target('a')], { onChanged: vi.fn() });
    expect(currentToasts()[0].open).toBe(true);

    vi.advanceTimersByTime(BOOKMARK_DELETION_UNDO_WINDOW_MS);
    expect(currentToasts()[0].open).toBe(false);
  });

  it('quotes titles cut at the truncateLength setting', async () => {
    const longTitle = 'L'.repeat(40);
    bookmarks = installFakeBookmarks([
      { id: 'f', title: 'Folder' },
      { id: 'long', parentId: 'f', title: longTitle, url: 'https://e2e.invalid/long' },
    ]);
    await saveSettings({ truncateLength: 20 });

    await deleteBookmarksWithUndo([target('long', longTitle)], { onChanged: vi.fn() });
    expect(currentToasts()[0].description).toBe(
      `Deleted "${'L'.repeat(20)}...". Undo within 10 seconds.`,
    );
  });
});
