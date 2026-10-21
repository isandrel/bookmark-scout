/**
 * The answer AI Folder Reorganization asks the model for: moves, each with a confidence and a
 * reason, and a summary. Its own small module, because the AI host page checks every answer with
 * it and must not load the rest of the reorganization service at start.
 */
import { z } from 'zod';

// Simplified schema for OpenAI - all fields must be required
// Only supporting move operations for now (most common use case)
const moveOperationSchema = z.object({
  bookmarkId: z.string().describe(agentText('move_operation_schema.bookmark_id')),
  bookmarkTitle: z.string().describe(agentText('move_operation_schema.bookmark_title')),
  toFolderPath: z.string().describe(agentText('move_operation_schema.to_folder_path')),
  confidence: z.number().min(0).max(1).describe(agentText('move_operation_schema.confidence')),
  reason: z.string().describe(agentText('move_operation_schema.reason')),
});

export const reorganizationResultSchema = z.object({
  operations: z
    .array(moveOperationSchema)
    .describe(agentText('reorganization_result_schema.operations')),
  summary: z.string().describe(agentText('reorganization_result_schema.summary')),
});

export type ReorganizationResult = z.infer<typeof reorganizationResultSchema>;
