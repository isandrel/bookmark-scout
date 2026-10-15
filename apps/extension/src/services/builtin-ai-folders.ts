/**
 * Folder suggestions from the browser's built-in model (Chrome's built-in AI). Its context is
 * small, so it never sees every folder: the local word match quick save uses
 * (`lib/folder-ranking.ts`, BM25) shortlists `[folders] candidates` folders, and the model only
 * orders the best of them, answering with their ids. Instructions are English, the declared
 * language, whatever the page's language. When the model fails or takes longer than
 * `[folders] timeout_ms`, the word match's own picks are the suggestions, so the click still has
 * an answer. Hosted services get the full folder list instead (`recommendFolders`).
 *
 * The call itself is passed in (`generate`), so the popup can use the AI client and quick save the
 * AI host page. Nothing here loads the AI SDK.
 */

import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const folderConfig = builtinAIConfig.folders;

/** What the model answers: ids from the shortlist, best first. */
export type BuiltinFolderAnswer = { folders: string[] };

export type BuiltinFolderRequest = {
  schema: z.ZodType<BuiltinFolderAnswer>;
  system: string;
  prompt: string;
  abortSignal: AbortSignal;
};

type PageForFolders = { title: string; url: string; pageText?: string };

const indexes = new WeakMap<readonly BookmarkTreeNode[], FolderRankingIndex>();

/** The word-match index of a tree, built once per tree the page holds. */
function folderIndex(folders: readonly BookmarkTreeNode[]): FolderRankingIndex {
  let index = indexes.get(folders);
  if (!index) {
    index = buildFolderRankingIndex(folders);
    indexes.set(folders, index);
  }
  return index;
}

/**
 * The folders the model chooses among: the best word matches first, then, when fewer match, the
 * shallowest other folders, so a page that shares no word with any folder still gets a choice.
 */
export function shortlistFolders(
  index: FolderRankingIndex,
  page: { title?: string; url?: string },
  count: number,
): RankedFolder[] {
  const ranked = rankFolders(index, page, { limit: count, minScore: 0 });
  if (ranked.length >= count) return ranked;
  const taken = new Set(ranked.map((folder) => folder.id));
  const rest = index.documents
    .filter((document) => !taken.has(document.id))
    .sort(
      (left, right) =>
        left.path.length - right.path.length ||
        left.path
          .join(AI_FOLDER_PATH_SEPARATOR)
          .localeCompare(right.path.join(AI_FOLDER_PATH_SEPARATOR)),
    )
    .slice(0, count - ranked.length)
    .map((document) => ({ id: document.id, path: document.path, score: 0 }));
  return [...ranked, ...rest];
}

/** The model's instructions, the page and shortlist it reads, and its answer's schema. */
export function buildBuiltinFolderRequest(
  page: PageForFolders,
  candidates: readonly RankedFolder[],
  count: number,
): Omit<BuiltinFolderRequest, 'abortSignal'> {
  const ids = candidates.map((folder) => folder.id);
  const excerpt = page.pageText?.slice(0, folderConfig.page_excerpt_chars).trim();
  return {
    schema: z.object({
      folders: z.array(z.enum(ids as [string, ...string[]])).max(count),
    }),
    system: interpolatePrompt(folderConfig.system, { count }),
    prompt: interpolatePrompt(folderConfig.prompt, {
      title: page.title,
      url: page.url,
      text: excerpt ? interpolatePrompt(folderConfig.text_line, { text: excerpt }) : '',
      folders: candidates
        .map((folder) => `${folder.id}: ${folder.path.join(AI_FOLDER_PATH_SEPARATOR)}`)
        .join('\n'),
    }),
  };
}

/**
 * Suggestions from folders in order, best first. The confidence mixes the place in that order
 * (`rank_weight`) with the word match's score against the best one, up to `max_confidence`: the
 * small model's own certainty is not calibrated, and it does not report one.
 */
export function toBuiltinRecommendations(
  ordered: readonly RankedFolder[],
  reason: string,
): FolderRecommendation[] {
  const topScore = Math.max(0, ...ordered.map((folder) => folder.score));
  return ordered.map((folder, position) => {
    const rank = 1 - position / ordered.length;
    const match = topScore > 0 ? folder.score / topScore : 0;
    const mixed = folderConfig.rank_weight * rank + (1 - folderConfig.rank_weight) * match;
    return {
      type: 'existing',
      folderId: folder.id,
      folderPath: folder.path.join(AI_FOLDER_PATH_SEPARATOR),
      parentPath: '',
      confidence: folderConfig.max_confidence * mixed,
      reason,
    };
  });
}

/**
 * Up to `count` folder suggestions for a page from the built-in model, or from the word match when
 * the model fails, is slow, or picks nothing usable.
 */
export async function recommendFoldersOnDevice(
  generate: (request: BuiltinFolderRequest) => Promise<BuiltinFolderAnswer>,
  page: PageForFolders,
  folders: readonly BookmarkTreeNode[],
  count: number,
): Promise<FolderRecommendation[]> {
  const index = folderIndex(folders);
  if (index.documents.length === 0) return noFoldersRecommendation();
  const wordMatch = () =>
    toBuiltinRecommendations(
      rankFolders(index, page, { limit: count }),
      t('builtinAi_reasonWordMatch'),
    );

  const candidates = shortlistFolders(index, page, folderConfig.candidates);
  let answer: BuiltinFolderAnswer;
  try {
    answer = await generate({
      ...buildBuiltinFolderRequest(page, candidates, count),
      abortSignal: AbortSignal.timeout(folderConfig.timeout_ms),
    });
  } catch {
    // The activity log has the model's error; the click still gets the local answer.
    return wordMatch();
  }
  const byId = new Map(candidates.map((folder) => [folder.id, folder]));
  const picked = [...new Set(answer.folders)].flatMap((id) => byId.get(id) ?? []).slice(0, count);
  return picked.length > 0
    ? toBuiltinRecommendations(picked, t('builtinAi_reasonModel'))
    : wordMatch();
}
