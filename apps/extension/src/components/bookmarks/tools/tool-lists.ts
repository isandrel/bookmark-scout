import { z } from 'zod';

const listLimits = readConfig(
  'ui/tool-lists',
  z.strictObject({
    import_conflicts: z.number().int().positive(),
    import_errors: z.number().int().positive(),
    bulk_preview_items: z.number().int().positive(),
  }),
);

/** How many items reviews list before summarizing the rest (config/ui/tool-lists.toml). */
export const TOOL_LIST_LIMITS = {
  importConflicts: listLimits.import_conflicts,
  importErrors: listLimits.import_errors,
  bulkPreviewItems: listLimits.bulk_preview_items,
} as const;
