/**
 * The answer AI Folder Reorganization asks the model for: moves, each with a confidence and a
 * reason, and a summary. Its own small module, because the AI host page checks every answer with
 * it and must not load the rest of the reorganization service at start.
 */
import { z } from 'zod';

// Simplified schema for OpenAI - all fields must be required
// Only supporting move operations for now (most common use case)
const moveOperationSchema = z.object({
  bookmarkId: z.string().describe('ID of bookmark to move'),
  bookmarkTitle: z.string().describe('Title of the bookmark'),
  toFolderPath: z.string().describe('Target folder path'),
  confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1'),
  reason: z.string().describe('Why move this bookmark (do not include confidence here)'),
});

export const reorganizationResultSchema = z.object({
  operations: z.array(moveOperationSchema).describe('List of bookmark moves'),
  summary: z.string().describe('Brief summary of reorganization'),
});

export type ReorganizationResult = z.infer<typeof reorganizationResultSchema>;
