/**
 * AI-powered Folder Reorganization Service
 * Analyzes bookmarks and suggests moving them into existing folders or new ones.
 */

import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface BookmarkInfo {
  id: string;
  title: string;
  url: string;
  currentFolderId: string;
  currentFolderPath: string;
}

/** Move a bookmark to another folder, creating the folder when the model suggested a new one. */
export interface MoveBookmarkOp {
  type: 'move';
  bookmarkId: string;
  bookmarkTitle: string;
  bookmarkUrl: string;
  /** The folder the bookmark was in when the plan was made; the move is skipped once it left. */
  fromFolderId: string;
  fromFolderPath: string;
  /** The full target path, including folders the move creates. */
  toFolderPath: string;
  /** The existing target folder, or the existing folder `newFolderTitles` are created in. */
  toFolderId: string;
  /** Folders to create under `toFolderId`, outermost first; empty when the target exists. */
  newFolderTitles: string[];
  confidence: number;
  reason: string;
}

/** The only change a plan makes; the model is asked for moves alone. */
export type ReorganizationOperation = MoveBookmarkOp;

export interface ReorganizationPlan {
  operations: ReorganizationOperation[];
  summary: string;
  createdAt: number;
  safety: {
    minConfidence: number;
    batchSize: number;
    batchCount: number;
    excludedLowConfidence: number;
  };
  /** Debug data for transparency - shows what was sent to AI */
  debugData?: {
    request: unknown;
    response: unknown;
    systemPrompt: string;
  };
}

export interface ReorganizationConfig {
  maxCategories: number;
  minItemsPerFolder: number;
  maxItemsPerFolder: number;
  minConfidence: number;
  batchSize: number;
}

export type ApplyReorganizationOptions = {
  /** The user reviewed the plan; an AI plan is never applied without that. */
  previewConfirmed?: boolean;
};

/**
 * What applying a plan did: `blocked` when the preview was not confirmed, otherwise the
 * moves' counts, issues, and single-use undo from `applyBookmarkChanges`.
 */
export type ApplyReorganizationResult =
  | { status: 'blocked'; error: string }
  | ({ status: 'applied' } & BookmarkChangesResult);

/** Reorganization limits from the setting defaults; callers override them with stored values. */
function getReorgConfig(): ReorganizationConfig {
  return {
    maxCategories: defaultSettings.aiMaxCategories,
    minItemsPerFolder: defaultSettings.aiMinItemsPerFolder,
    maxItemsPerFolder: defaultSettings.aiMaxItemsPerFolder,
    minConfidence: defaultSettings.reorganizationMinConfidence,
    batchSize: defaultSettings.reorganizationBatchSize,
  };
}

function resolveReorgConfig(config?: Partial<ReorganizationConfig>): ReorganizationConfig {
  const defaults = getReorgConfig();
  const merged = { ...defaults, ...config };

  return {
    ...merged,
    minConfidence: Math.min(1, Math.max(0, merged.minConfidence)),
    batchSize: Math.max(1, Math.floor(merged.batchSize)),
  };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * A plan path without its leading `folderTitle` segment, for display: most paths start with the
 * bookmarks bar, whose title differs by browser and language.
 */
export function stripLeadingFolder(path: string, folderTitle: string | undefined): string {
  const prefix = folderTitle ? `${folderTitle}${AI_FOLDER_PATH_SEPARATOR}` : '';
  return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export function collectBookmarks(
  nodes: BookmarkTreeNode[],
  parentPath = '',
  parentId = '',
): BookmarkInfo[] {
  const result: BookmarkInfo[] = [];
  aiLogger.debug({ nodesCount: nodes.length }, 'collectBookmarks called');
  for (const node of nodes) {
    const currentPath =
      parentPath && node.title
        ? `${parentPath}${AI_FOLDER_PATH_SEPARATOR}${node.title}`
        : node.title || parentPath;
    if (node.url) {
      result.push({
        id: node.id,
        title: node.title,
        url: node.url,
        currentFolderId: parentId,
        currentFolderPath: parentPath,
      });
    }
    if (node.children) {
      result.push(...collectBookmarks(node.children, node.url ? parentPath : currentPath, node.id));
    }
  }
  return result;
}

export function findFolderByPath(folders: FolderInfo[], path: string): FolderInfo | undefined {
  return folders.find((f) => f.path === path);
}

type PlannedTarget = Pick<MoveBookmarkOp, 'toFolderId' | 'toFolderPath' | 'newFolderTitles'>;

/**
 * Where a suggested path lands: the folder with that path, or the deepest existing folder on it
 * with the rest of the path to create inside. A path that starts with no existing folder is
 * created inside `newRoot`. Undefined for an empty path.
 */
function planTargetFolder(
  path: string,
  folders: FolderInfo[],
  newRoot: FolderInfo | undefined,
): PlannedTarget | undefined {
  const segments = path
    .split(AI_FOLDER_PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;
  for (let depth = segments.length; depth > 0; depth -= 1) {
    const prefix = segments.slice(0, depth).join(AI_FOLDER_PATH_SEPARATOR);
    const folder = findFolderByPath(folders, prefix);
    if (folder) {
      const newFolderTitles = segments.slice(depth);
      return {
        toFolderId: folder.id,
        toFolderPath: [folder.path, ...newFolderTitles].join(AI_FOLDER_PATH_SEPARATOR),
        newFolderTitles,
      };
    }
  }
  if (!newRoot) return undefined;
  return {
    toFolderId: newRoot.id,
    toFolderPath: [newRoot.path, ...segments].join(AI_FOLDER_PATH_SEPARATOR),
    newFolderTitles: segments,
  };
}

/** How many folders applying the plan creates; every new level counts once. */
export function countPlannedNewFolders(plan: Pick<ReorganizationPlan, 'operations'>): number {
  const folders = new Set<string>();
  for (const op of plan.operations) {
    op.newFolderTitles.forEach((_title, index) => {
      folders.add(JSON.stringify([op.toFolderId, ...op.newFolderTitles.slice(0, index + 1)]));
    });
  }
  return folders.size;
}

/**
 * The folder new top-level categories go into: the folder the scope is, or the bookmarks bar
 * when the scope is the whole tree.
 */
function findNewFolderRoot(
  scope: BookmarkTreeNode[],
  folders: FolderInfo[],
): FolderInfo | undefined {
  const scopeFolder = scope.find((node) => !node.url && !isBookmarkTreeRoot(node));
  const id = scopeFolder?.id ?? findBookmarksBarFolder(scope)?.id;
  return folders.find((folder) => folder.id === id);
}

/** The folder limits sent to the model; unlimited ones (-1) are left out. */
function limitsForRequest(cfg: ReorganizationConfig) {
  const limits = {
    maxCategories: cfg.maxCategories,
    minItemsPerFolder: cfg.minItemsPerFolder,
    maxItemsPerFolder: cfg.maxItemsPerFolder,
  };
  return Object.fromEntries(Object.entries(limits).filter(([, value]) => value > 0));
}

// ============================================================================
// Main Service
// ============================================================================

/**
 * What a plan needs besides the model's answers, fixed when the analysis starts: the prompt,
 * the limits, every folder in scope, and where new folders go. A background job keeps it as its
 * options, so the plan is built the same way from answers it saved earlier.
 */
export type ReorganizationContext = {
  system: string;
  config: ReorganizationConfig;
  folders: FolderInfo[];
  newFolderRootId?: string;
};

const bookmarkInfoSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  currentFolderId: z.string(),
  currentFolderPath: z.string(),
});

/** A stored `ReorganizationContext`, checked before a job uses it. */
export const reorganizationContextSchema = z.strictObject({
  system: z.string(),
  config: z.strictObject({
    maxCategories: z.number(),
    minItemsPerFolder: z.number(),
    maxItemsPerFolder: z.number(),
    minConfidence: z.number(),
    batchSize: z.number().int().positive(),
  }),
  folders: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      path: z.string(),
      bookmarkCount: z.number().int().nonnegative(),
    }),
  ),
  newFolderRootId: z.string().optional(),
}) satisfies z.ZodType<ReorganizationContext>;

/** A reorganization job's options: what its plan is built with, and where its requests go. */
export const reorganizationJobOptionsSchema = z.strictObject({
  context: reorganizationContextSchema,
  destination: z.string(),
});

/** A stored batch of bookmarks for one request. */
export const reorganizationBatchSchema = z.array(bookmarkInfoSchema);

/** A stored batch result; a batch whose answer did not fit has no `response`. */
export const reorganizationBatchResultSchema = z.object({
  bookmarks: reorganizationBatchSchema,
  response: reorganizationResultSchema.optional(),
});

/** One request's bookmarks and the model's answer for them. */
export type ReorganizationBatchResult = {
  bookmarks: BookmarkInfo[];
  response: ReorganizationResult;
};

/**
 * Reads the scope and the stored limits and builds the prompt; the bookmarks come back in the
 * batches one request each holds. Throws when the scope has no bookmarks.
 */
export async function prepareReorganization(
  scope: BookmarkTreeNode[],
  config?: Partial<ReorganizationConfig>,
): Promise<{ context: ReorganizationContext; batches: BookmarkInfo[][] }> {
  // Folder limits are Options settings; defaults alone would silently ignore the user's values.
  const stored = await getSettings();
  const cfg = resolveReorgConfig({
    maxCategories: stored.aiMaxCategories,
    minItemsPerFolder: stored.aiMinItemsPerFolder,
    maxItemsPerFolder: stored.aiMaxItemsPerFolder,
    ...config,
  });
  const allBookmarks = collectBookmarks(scope);
  const folders = collectFolders(scope);
  aiLogger.debug(
    { bookmarkCount: allBookmarks.length, folderCount: folders.length, config: cfg },
    'Collected bookmarks and folders',
  );
  if (allBookmarks.length === 0) {
    aiLogger.warn('No bookmarks found in scope');
    throw new Error(t('error_aiReorganizeEmptyScope'));
  }
  const { system } = await buildPrompt('folder_reorganization', {
    aiMaxCategories: cfg.maxCategories,
    aiMinItemsPerFolder: cfg.minItemsPerFolder,
    aiMaxItemsPerFolder: cfg.maxItemsPerFolder,
  });
  const newFolderRootId = findNewFolderRoot(scope, folders)?.id;
  return {
    context: { system, config: cfg, folders, ...(newFolderRootId ? { newFolderRootId } : {}) },
    batches: chunkItems(allBookmarks, cfg.batchSize),
  };
}

/** The prompt of one request: its bookmarks, every folder, and the limits. */
export function reorganizationRequest(context: ReorganizationContext, bookmarks: BookmarkInfo[]) {
  return {
    bookmarks: bookmarks.map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      currentFolder: bookmark.currentFolderPath,
    })),
    folders: context.folders.map((folder) => ({
      path: folder.path,
      bookmarkCount: folder.bookmarkCount,
    })),
    config: limitsForRequest(context.config),
  };
}

/**
 * The plan from the model's answers, in batch order: moves under the confidence threshold, for
 * bookmarks outside their batch, repeated, or to where the bookmark already is are dropped.
 */
export function buildReorganizationPlan(
  context: ReorganizationContext,
  batchResults: ReorganizationBatchResult[],
): ReorganizationPlan {
  const cfg = context.config;
  const allFolders = context.folders;
  const allBookmarks = batchResults.flatMap(({ bookmarks }) => bookmarks);
  const newFolderRoot = allFolders.find((folder) => folder.id === context.newFolderRootId);
  const returnedOperations = batchResults.flatMap(({ response }) => response.operations);
  aiLogger.info(
    { operationsCount: returnedOperations.length, batchCount: batchResults.length },
    'AI returned operations',
  );

  const seenBookmarkIds = new Set<string>();
  let excludedLowConfidence = 0;
  const operations: ReorganizationOperation[] = batchResults.flatMap(({ response, bookmarks }) => {
    const batchBookmarkIds = new Set(bookmarks.map((bookmark) => bookmark.id));
    return response.operations.flatMap((op) => {
      if (op.confidence < cfg.minConfidence) {
        excludedLowConfidence += 1;
        return [];
      }

      const bookmark = allBookmarks.find((b) => b.id === op.bookmarkId);
      if (!bookmark || !batchBookmarkIds.has(op.bookmarkId) || seenBookmarkIds.has(op.bookmarkId)) {
        return [];
      }

      const target = planTargetFolder(op.toFolderPath, allFolders, newFolderRoot);
      if (
        !target ||
        (target.newFolderTitles.length === 0 && target.toFolderId === bookmark.currentFolderId)
      ) {
        return [];
      }

      seenBookmarkIds.add(op.bookmarkId);
      return [
        {
          type: 'move' as const,
          bookmarkId: op.bookmarkId,
          bookmarkTitle: bookmark.title,
          bookmarkUrl: bookmark.url,
          fromFolderId: bookmark.currentFolderId,
          fromFolderPath: bookmark.currentFolderPath,
          ...target,
          confidence: op.confidence,
          reason: op.reason,
        } satisfies MoveBookmarkOp,
      ];
    });
  });

  aiLogger.info(
    { filteredCount: operations.length, excludedLowConfidence },
    'Filtered unsafe and no-op operations',
  );

  return {
    operations,
    summary: batchResults
      .map(({ response }) => response.summary)
      .filter(Boolean)
      .join(' '),
    createdAt: Date.now(),
    safety: {
      minConfidence: cfg.minConfidence,
      batchSize: cfg.batchSize,
      batchCount: batchResults.length,
      excludedLowConfidence,
    },
    debugData: {
      request: batchResults.map(({ bookmarks }) => reorganizationRequest(context, bookmarks)),
      response: batchResults.map(({ response }) => response),
      systemPrompt: context.system,
    },
  };
}

export async function generateReorganizationPlan(
  bookmarks: BookmarkTreeNode[],
  settings: AISettings,
  config?: Partial<ReorganizationConfig>,
): Promise<ReorganizationPlan> {
  validateAISettings(settings);
  aiLogger.info({ inputNodes: bookmarks.length }, 'Starting reorganization plan generation');
  const { context, batches } = await prepareReorganization(bookmarks, config);
  aiLogger.info(
    { provider: settings.provider, model: settings.model },
    'Calling AI for reorganization',
  );
  const batchResults: ReorganizationBatchResult[] = [];
  for (const bookmarkBatch of batches) {
    const { object } = await generateAIObject({
      settings,
      source: 'reorganization',
      schema: reorganizationResultSchema,
      system: context.system,
      prompt: JSON.stringify(reorganizationRequest(context, bookmarkBatch)),
    });
    batchResults.push({ bookmarks: bookmarkBatch, response: object });
  }
  return buildReorganizationPlan(context, batchResults);
}

/**
 * Applies a reorganization plan the user confirmed, in plan order. Each move is skipped when its
 * bookmark was deleted, edited, or moved since the preview, so a stale plan never overrides a
 * newer change; suggested folders that do not exist yet are created as part of the same
 * undoable change set.
 */
export async function applyReorganizationPlan(
  plan: ReorganizationPlan,
  options: ApplyReorganizationOptions = {},
): Promise<ApplyReorganizationResult> {
  const { previewConfirmed = false } = options;
  const config = resolveReorgConfig({ minConfidence: plan.safety.minConfidence });
  if (!previewConfirmed) {
    return { status: 'blocked', error: t('ai_reorgPreviewRequired') };
  }

  const changes = plan.operations
    .filter((operation) => operation.confidence >= config.minConfidence)
    .map(
      (op): BookmarkChange => ({
        kind: 'move',
        id: op.bookmarkId,
        title: op.bookmarkTitle,
        expect: { parentId: op.fromFolderId, url: op.bookmarkUrl },
        to: { parentId: op.toFolderId, createPath: op.newFolderTitles },
      }),
    );
  return {
    status: 'applied',
    ...(await applyBookmarkChanges(changes, { tool: 'tools_aiReorganize' })),
  };
}
