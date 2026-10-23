/**
 * How the popup and side panel tree is drawn (`config/ui/popup-tree-view.toml`): its virtual list
 * tunables, how many open folders "As last left" remembers, and the row metrics of each Tree
 * Density (`treeDensity`), which the rows read as CSS variables (`popupTreeDensityStyle`).
 */
import { z } from 'zod';

const densitySchema = z.strictObject({
  row_height_px: z.number().int().positive(),
  row_padding_y_px: z.number().int().nonnegative(),
  button_px: z.number().int().positive(),
  indent_px: z.number().int().nonnegative(),
});

const treeViewConfig = readConfig(
  'ui/popup-tree-view',
  z.strictObject({
    overscan_rows: z.number().int().nonnegative(),
    padding_px: z.number().int().nonnegative(),
    max_remembered_folders: z.number().int().positive(),
    density: z.strictObject({ comfortable: densitySchema, compact: densitySchema }),
  }),
);

export const POPUP_TREE_VIEW = treeViewConfig;

export type PopupTreeDensity = z.infer<typeof densitySchema>;

/** The row metrics of a Tree Density. */
export function popupTreeDensity(density: TreeDensity): PopupTreeDensity {
  return treeViewConfig.density[density];
}

/**
 * A density's metrics as the CSS variables the tree's rows size themselves by
 * (`--popup-tree-row`, `--popup-tree-row-pad`, `--popup-tree-button`).
 */
export function popupTreeDensityStyle(density: TreeDensity): Record<`--${string}`, string> {
  const metrics = popupTreeDensity(density);
  return {
    '--popup-tree-row': `${metrics.row_height_px}px`,
    '--popup-tree-row-pad': `${metrics.row_padding_y_px}px`,
    '--popup-tree-button': `${metrics.button_px}px`,
  };
}
