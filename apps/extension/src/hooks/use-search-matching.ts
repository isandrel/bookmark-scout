import { useMemo } from 'react';

/** Search Matching (Settings > Saving & Search) as the search engine takes it (`bm25-search.ts`). */
export function useSearchMatching(): SearchMatching {
  const { settings } = useSettings();
  const { searchFuzzy, searchFuzzyOneEdit, searchFuzzyTwoEdits, searchPrefix } = settings;
  const { searchBm25K1, searchBm25B } = settings;
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt only when one of these changes.
  return useMemo(
    () => searchMatchingOf(settings),
    [searchFuzzy, searchFuzzyOneEdit, searchFuzzyTwoEdits, searchPrefix, searchBm25K1, searchBm25B],
  );
}

/** How much each part of a folder counts in folder matches (Settings > Saving & Search). */
export function useFolderMatchWeights(): FolderMatchWeights {
  const { value: name } = useSetting('folderMatchesNameWeight');
  const { value: parents } = useSetting('folderMatchesParentWeight');
  const { value: bookmarks } = useSetting('folderMatchesBookmarkWeight');
  return useMemo(() => ({ name, parents, bookmarks }), [name, parents, bookmarks]);
}
