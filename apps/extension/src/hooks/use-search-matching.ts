import { useMemo } from 'react';

/** Search Matching (Settings > Saving & Search) as the search engine takes it (`bm25-search.ts`). */
export function useSearchMatching(): SearchMatching {
  const { value: fuzzy } = useSetting('searchFuzzy');
  const { value: fuzzyOneEdit } = useSetting('searchFuzzyOneEdit');
  const { value: fuzzyTwoEdits } = useSetting('searchFuzzyTwoEdits');
  const { value: prefix } = useSetting('searchPrefix');
  const { value: k1 } = useSetting('searchBm25K1');
  const { value: b } = useSetting('searchBm25B');
  return useMemo(
    () => ({ fuzzy, fuzzyOneEdit, fuzzyTwoEdits, prefix, k1, b }),
    [fuzzy, fuzzyOneEdit, fuzzyTwoEdits, prefix, k1, b],
  );
}

/** How much each part of a folder counts in folder matches (Settings > Saving & Search). */
export function useFolderMatchWeights(): FolderMatchWeights {
  const { value: name } = useSetting('folderMatchesNameWeight');
  const { value: parents } = useSetting('folderMatchesParentWeight');
  const { value: bookmarks } = useSetting('folderMatchesBookmarkWeight');
  return useMemo(() => ({ name, parents, bookmarks }), [name, parents, bookmarks]);
}
