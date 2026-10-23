/**
 * What the bookmark manager keeps on this device between visits, besides its table view
 * (`bookmark-table-view-storage.ts`): its sidebars' widths and whether each was open
 * (`STORAGE_ITEMS.managerSidebars`), and the folder it showed last (`STORAGE_ITEMS
 * .managerLastFolder`), for Sidebars on Open and Start Folder in Options > Behavior > Manager
 * view.
 */
import { z } from 'zod';

const sidebarsSchema = z.object({
  foldersOpen: z.boolean().optional(),
  toolsOpen: z.boolean().optional(),
  foldersWidth: z.number().int().positive().optional(),
  toolsWidth: z.number().int().positive().optional(),
});

/** Each sidebar's width the user set, and whether it was open, when known. */
export type ManagerSidebarsState = z.infer<typeof sidebarsSchema>;

export const managerSidebarsValue = defineStoredValue<ManagerSidebarsState>(
  STORAGE_ITEMS.managerSidebars,
  { schema: sidebarsSchema, empty: {}, isEmpty: (state) => Object.keys(state).length === 0 },
);

/** The id of the folder the manager showed last; empty until one is recorded. */
export const managerLastFolderValue = defineStoredValue<string>(STORAGE_ITEMS.managerLastFolder, {
  schema: z.string().max(INPUT_LIMITS.chars.folder_id),
  empty: '',
  isEmpty: (id) => id === '',
});

/** Reads what decides the manager's layout before its first render (`mountExtensionPage`). */
export function preloadManagerPage(): Promise<unknown> {
  return Promise.all([preloadBookmarkTableView(), preloadStoredValue(managerSidebarsValue)]);
}
