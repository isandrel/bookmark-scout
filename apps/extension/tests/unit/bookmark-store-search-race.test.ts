import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { useBookmarkStore } from '@/stores/bookmark-store';
import type { BookmarkTreeNode } from '@/types';

// The query filter loads on the first search; holding it back lets a newer query arrive while an
// older one is still waiting for it. Its own module, so no earlier search has loaded it already.
const filterGate = vi.hoisted(() => {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
});

vi.mock('@/lib/bookmark-query-filter.lazy', async (importOriginal) => {
  await filterGate.promise;
  return importOriginal();
});

const tree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          { id: 'old', parentId: '1', title: 'Archive notes', url: 'https://old.test/' },
          { id: 'react', parentId: '1', title: 'React Hooks', url: 'https://react.dev/' },
        ],
      },
    ],
  },
];

/** The bookmark ids the popup's tree shows. */
function shownIds(): string[] {
  const ids: string[] = [];
  const walk = (nodes: readonly BookmarkTreeNode[]) => {
    for (const node of nodes) {
      if (node.url) ids.push(node.id);
      if (node.children) walk(node.children);
    }
  };
  walk(useBookmarkStore.getState().filteredFolders);
  return ids;
}

/** Types `query` and lets the popup's debounce run it, as `PopupPage` does. */
function search(query: string): void {
  useBookmarkStore.getState().setQuery(query);
  useBookmarkStore.getState().setDebouncedQuery(query);
}

beforeEach(() => {
  fakeBrowser.reset();
  useBookmarkStore.setState({
    folders: tree,
    filteredFolders: tree,
    isLoading: false,
    query: '',
    debouncedQuery: '',
    expandedFolders: [],
    preSearchExpandedFolders: null,
    searchExpansion: null,
  });
});

describe('a newer search winning over an older one', () => {
  it('shows only the latest query once a search that began earlier finishes loading', async () => {
    await bookmarkMetadataValue.set({ old: { tags: ['later'] } });
    search('tag:later');
    // Still loading: nothing is filtered yet, and no result of the older query is shown.
    expect(shownIds()).toEqual(['old', 'react']);
    search('react');

    filterGate.release();
    await vi.waitFor(() => expect(shownIds()).toEqual(['react']));

    // Tags read after the change re-filter by the query typed now, never the older one.
    await bookmarkMetadataValue.set({ old: { tags: ['later', 'react'] } });
    await vi.waitFor(() => expect(shownIds()).toEqual(['old', 'react']));
    await bookmarkMetadataValue.set({ old: { tags: ['later'] } });
    await vi.waitFor(() => expect(shownIds()).toEqual(['react']));
    expect(useBookmarkStore.getState().debouncedQuery).toBe('react');
  });

  it('keeps the latest query when a tree reload started before it finishes after it', async () => {
    let finishReload: ((nodes: Browser.bookmarks.BookmarkTreeNode[]) => void) | undefined;
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReload = resolve;
        }),
    );
    search('archive');
    await vi.waitFor(() => expect(shownIds()).toEqual(['old']));

    const reload = useBookmarkStore.getState().refreshFolders();
    await vi.waitFor(() => expect(finishReload).toBeDefined());
    search('react');
    expect(shownIds()).toEqual(['react']);
    // The reload read the tree while the older query was shown; it lands after the newer one.
    finishReload?.(tree as Browser.bookmarks.BookmarkTreeNode[]);
    await reload;
    expect(shownIds()).toEqual(['react']);
  });
});
