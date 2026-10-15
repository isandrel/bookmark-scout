/**
 * `recommendFolders`: AI folder suggestions for the current page, from a page (the popup and side
 * panel). Kept apart from `ai-recommendation.ts` because it reads the page (Readability, Turndown)
 * and calls the AI client, which the background must not bundle; the background uses
 * `recommendFoldersVia` instead.
 */

import type { BookmarkTreeNode } from '@/types';

/**
 * Recommends multiple folders for a bookmark using AI.
 * Returns up to maxRecommendations folder suggestions ranked by confidence.
 */
export async function recommendFolders(
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  settings: AISettings,
  maxRecommendations: number = defaultSettings.aiMaxRecommendations,
  /** Send the page's readable text too; needs website access. */
  readPage = false,
): Promise<FolderRecommendation[]> {
  validateAISettings(settings);

  const folderList = extractFolderPaths(folders);
  if (folderList.length === 0) return noFoldersRecommendation();

  const [page] = await addPageText([bookmark], readPage);
  if (isBuiltinProvider(settings.provider)) {
    // A shortlist the small model can read, with the local word match when it cannot answer.
    return recommendFoldersOnDevice(
      async (request) =>
        (await generateAIObject({ settings, source: 'folderRecommendation', ...request })).object,
      page,
      folders,
      maxRecommendations,
    );
  }
  const { system, prompt } = await buildFolderRecommendationRequest(
    page,
    folderList.map((f) => f.path),
    maxRecommendations,
  );
  const { object } = await generateAIObject({
    settings,
    source: 'folderRecommendation',
    schema: folderRecommendationsSchema,
    system,
    prompt,
  });

  // Never show more than the setting allows.
  return toFolderRecommendations(object, folders, maxRecommendations);
}
