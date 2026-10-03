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

    expect(await deleteBookmarksWithUndo([target('b')], { onChanged, remove })).toBe(1);
    expect(remove).toHaveBeenCalledWith('b');
    expect(bookmarks.childIds('f')).toEqual(['a', 'c']);
    expect(onChanged).toHaveBeenCalledTimes(1);

    const [undo] = currentToasts();
    expect(undo).toMatchObject({
      title: '✓ Bookmark Deleted',
      description: 'Deleted "B". Undo within 10 seconds.',
      variant: 'success',
      duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
    });

    await pressUndo(undo);
    expect(bookmarks.childIds('f')).toHaveLength(3);
    expect(bookmarks.get(bookmarks.childIds('f')[1])?.title).toBe('B');
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(currentToasts()[0]).toMatchObject({ description: 'Restored "B".' });
  });

  it('stops at the first failure, reports it, and offers Undo for what was deleted', async () => {
    bookmarks.fail.remove.add('b');
    const deleted = await deleteBookmarksWithUndo([target('a'), target('b'), target('c')], {
      onChanged: vi.fn(),
    });

    expect(deleted).toBe(1);
    expect(bookmarks.childIds('f')).toEqual(['b', 'c']);
    // Both stay: the failure is not hidden behind the Undo toast.
    const [failure, undo] = currentToasts();
    expect(failure).toMatchObject({ title: '× Error Deleting Bookmark', variant: 'destructive' });
    expect(undo.description).toBe('Deleted "A". Undo within 10 seconds.');
  });

  it('deletes nothing when an item cannot be captured for undo', async () => {
    const deleted = await deleteBookmarksWithUndo([target('a'), target('missing')], {
      onChanged: vi.fn(),
    });

    expect(deleted).toBe(0);
    expect(bookmarks.childIds('f')).toEqual(['a', 'b', 'c']);
    expect(currentToasts()[0]).toMatchObject({ variant: 'destructive' });
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
