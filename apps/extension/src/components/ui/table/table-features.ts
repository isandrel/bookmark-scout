import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/react-table';

export const bookmarkTableFeatures = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
});

export type BookmarkTableFeatures = typeof bookmarkTableFeatures;
