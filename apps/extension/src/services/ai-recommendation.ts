/**
 * AI-powered folder recommendation service.
 * Uses the shared AI client for multi-provider support.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';
import { createAIModel, validateAISettings, type AISettings } from './ai-client';
import { FOLDER_RECOMMENDATION_PROMPT } from './ai-prompts';

/**
 * Folder recommendation result.
 */
export interface FolderRecommendation {
  type: 'existing' | 'new';
  folderPath: string;
  folderId?: string;
  parentPath?: string;
  confidence: number;
  reason: string;
}

/**
 * Zod schema for single recommendation.
 * Note: All fields must be required for OpenAI structured output compatibility.
 */
const singleRecommendationSchema = z.object({
  type: z.enum(['existing', 'new']),
  folderPath: z.string().describe('Full folder path like "AI/Tools" or new folder name'),
  parentPath: z.string().describe('Parent path for new folder, empty string if type is existing'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reason: z.string().describe('Brief reason for this recommendation'),
});

/**
 * Schema for multiple recommendations.
 */
const recommendationsSchema = z.object({
  recommendations: z.array(singleRecommendationSchema).min(1).max(5),
});

/**
 * Extracts folder paths from bookmark tree.
 * Returns array of "Parent/Child/Grandchild" formatted paths.
 */
export function extractFolderPaths(
  nodes: BookmarkTreeNode[],
  parentPath = ''
): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = [];

  for (const node of nodes) {
    // Skip if it's a bookmark (has URL)
    if (node.url) continue;

    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;

    // Skip root nodes without titles
    if (node.title) {
      result.push({ id: node.id, path: currentPath });
    }

    // Recurse into children
    if (node.children) {
      result.push(...extractFolderPaths(node.children, node.title ? currentPath : ''));
    }
  }

  return result;
}

/**
 * Recommends multiple folders for a bookmark using AI.
 * Returns up to maxRecommendations folder suggestions ranked by confidence.
 */
export async function recommendFolders(
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  settings: AISettings,
  maxRecommendations = 3
): Promise<FolderRecommendation[]> {
  validateAISettings(settings);

  const folderList = extractFolderPaths(folders);
  const folderPaths = folderList.map((f) => f.path);

  if (folderPaths.length === 0) {
    return [{
      type: 'new',
      folderPath: 'Bookmarks',
      confidence: 1,
      reason: 'No existing folders found',
    }];
  }

  const model = createAIModel(settings);

  const { object } = await generateObject({
    model,
    schema: recommendationsSchema,
    system: `${FOLDER_RECOMMENDATION_PROMPT.system}

Return exactly ${maxRecommendations} folder recommendations ranked by confidence. Include a mix of:
1. Best matching existing folder
2. Second best existing folder  
3. Suggest a new folder if appropriate, or third best existing

Each recommendation should have a clear, brief reason.`,
    prompt: JSON.stringify({
      title: bookmark.title,
      url: bookmark.url,
      folders: folderPaths,
    }),
  });

  // Map folderPaths back to folderIds
  return object.recommendations.map((rec) => {
    const matchedFolder = folderList.find((f) => f.path === rec.folderPath);
    return {
      ...rec,
      folderId: matchedFolder?.id,
    };
  });
}

/**
 * Legacy single recommendation (deprecated, use recommendFolders).
 */
export async function recommendFolder(
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  settings: AISettings
): Promise<FolderRecommendation> {
  const recommendations = await recommendFolders(bookmark, folders, settings);
  return recommendations[0];
}

