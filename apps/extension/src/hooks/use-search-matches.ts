/**
 * The manager's search box read in the search query language: the ids of the bookmarks and folders
 * its query matches, by title, address, site, folder path, and the local tags and summaries. The
 * query filter (`bookmark-query-filter.lazy.ts`) loads on the first search, so the page opens
 * without it.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const searchConfig = readConfig(
  'ui/manager-search',
  z.strictObject({ prepare_when_idle: z.boolean() }),
);

type QueryFilter = typeof import('@/lib/bookmark-query-filter.lazy');

const loadQueryFilter = () => import('@/lib/bookmark-query-filter.lazy');

/** The pages' `useSearchMatches`, told to get ready for a search. */
const preloadListeners = new Set<() => void>();

/**
 * Gets ready for the first search before it is typed, such as when the search box gets focus:
 * loads the query filter and the tags and summaries, and builds the search documents.
 */
export function preloadSearchMatches(): void {
  for (const listener of preloadListeners) listener();
}

/**
 * The ids a query matches; `all` when it filters nothing (no query, or none of its terms could be
 * read), and `pending` while the query filter has not read it yet.
 */
export type SearchMatches = ReadonlySet<string> | 'all' | 'pending';

/**
 * Matches `query` against `tree`. Typing stays responsive on a large library: the matches follow
 * the query as a deferred value.
 */
export function useSearchMatches(tree: readonly BookmarkTreeNode[], query: string): SearchMatches {
  const deferredQuery = useDeferredValue(query);
  const hasQuery = deferredQuery.trim() !== '';
  // Once a search loads the filter, it keeps the tags and summaries current for the page's life.
  const [requested, setRequested] = useState(hasQuery);
  const [loaded, setLoaded] = useState<{
    filter: QueryFilter;
    metadata: StoredBookmarkMetadataById;
  }>();

  useEffect(() => {
    if (hasQuery) setRequested(true);
  }, [hasQuery]);

  useEffect(() => {
    const listener = () => setRequested(true);
    preloadListeners.add(listener);
    return () => {
      preloadListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!searchConfig.prepare_when_idle) return;
    const handle = requestIdleCallback(() => setRequested(true));
    return () => cancelIdleCallback(handle);
  }, []);

  // Builds the documents once loaded, in idle slices, so the first keystroke only matches them.
  useEffect(() => {
    if (!loaded || tree.length === 0) return;
    let handle = 0;
    const prepare = (deadline: IdleDeadline) => {
      const ready = loaded.filter.prepareSearchDocuments(
        tree,
        loaded.metadata,
        () => deadline.timeRemaining() <= 0,
      );
      if (!ready) handle = requestIdleCallback(prepare);
    };
    handle = requestIdleCallback(prepare);
    return () => cancelIdleCallback(handle);
  }, [loaded, tree]);

  useEffect(() => {
    if (!requested) return;
    let active = true;
    let stopObserving: (() => void) | undefined;
    loadQueryFilter()
      .then((filter) => {
        if (!active) return;
        stopObserving = filter.observeSearchMetadata((metadata) => setLoaded({ filter, metadata }));
      })
      .catch((error: unknown) => {
        bookmarkLogger.error({ error }, 'Failed to load the bookmark search');
      });
    return () => {
      active = false;
      stopObserving?.();
    };
  }, [requested]);

  const matched = useMemo(
    () =>
      loaded && hasQuery
        ? (loaded.filter.matchBookmarkTreeQuery(tree, deferredQuery, loaded.metadata) ?? 'all')
        : undefined,
    [deferredQuery, hasQuery, loaded, tree],
  );
  if (query.trim() === '') return 'all';
  // The deferred query trails the first character typed by a render.
  return matched ?? 'pending';
}
