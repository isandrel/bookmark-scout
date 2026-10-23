/**
 * The view a new or reset manager table shows, from Options > Behavior > Manager table (Default
 * Columns, Default Rows per Page, Default Sort), following the settings live.
 */
import { useMemo } from 'react';

export function useBookmarkTableViewDefaults(): BookmarkTableView {
  const { value: managerDefaultColumns } = useSetting('managerDefaultColumns');
  const { value: managerDefaultPageSize } = useSetting('managerDefaultPageSize');
  const { value: managerDefaultSort } = useSetting('managerDefaultSort');
  return useMemo(
    () =>
      getBookmarkTableViewDefaults({
        managerDefaultColumns,
        managerDefaultPageSize,
        managerDefaultSort,
      }),
    [managerDefaultColumns, managerDefaultPageSize, managerDefaultSort],
  );
}
