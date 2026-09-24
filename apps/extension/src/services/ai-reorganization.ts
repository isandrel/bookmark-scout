/**
 * AI-powered Folder Reorganization Service
 * Analyzes bookmarks and suggests optimal folder structure.
 * Supports: create folders, delete folders, rename folders, move bookmarks.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';
import { createAIModel, validateAISettings, type AISettings } from './ai-client';
import { buildPrompt } from './prompt-config';
import { defaultSettings } from '@/lib/settings-schema';
import { aiLogger } from '@/lib/logger';
import { browser } from 'wxt/browser';

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

export interface FolderInfo {
  id: string;
  title: string;
  path: string;
  bookmarkCount: number;
}

/** Create a new folder */
export interface CreateFolderOp {
  type: 'create';
  name: string;
  parentPath: string;
  description: string;
}

/** Delete an empty folder */
export interface DeleteFolderOp {
  type: 'delete';
  folderId: string;
  folderPath: string;
  reason: string;
}

/** Rename a folder */
export interface RenameFolderOp {
  type: 'rename';
  folderId: string;
  folderPath: string;
  oldName: string;
  newName: string;
  reason: string;
}

/** Move a bookmark to another folder */
export interface MoveBookmarkOp {
  type: 'move';
  bookmarkId: string;
  bookmarkTitle: string;
  bookmarkUrl: string;
  fromFolderPath: string;
  toFolderPath: string;
  toFolderId?: string;
  confidence: number;
  reason: string;
}

export type ReorganizationOperation = 
  | CreateFolderOp 
  | DeleteFolderOp 
  | RenameFolderOp 
  | MoveBookmarkOp;

export interface ReorganizationPlan {
  operations: ReorganizationOperation[];
  summary: string;
  createdAt: number;
  safety: {
    dryRunFirst: boolean;
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
  dryRunFirst: boolean;
  minConfidence: number;
  batchSize: number;
}

export type ApplyReorganizationOptions = {
  previewConfirmed?: boolean;
};

export type ApplyReorganizationResult = {
  success: boolean;
  errors: string[];
  applied: number;
  skipped: number;
};

/**
 * Get reorganization config from settings (no hardcoded values).
 */
export function getReorgConfig(): ReorganizationConfig {
  const settings = defaultSettings as Record<string, unknown>;
  return {
    maxCategories: (settings.aiMaxCategories as number) ?? 10,
    minItemsPerFolder: (settings.aiMinItemsPerFolder as number) ?? 3,
    maxItemsPerFolder: (settings.aiMaxItemsPerFolder as number) ?? 20,
    dryRunFirst: (settings.reorganizationDryRunFirst as boolean) ?? true,
    minConfidence: (settings.reorganizationMinConfidence as number) ?? 0.55,
    batchSize: (settings.reorganizationBatchSize as number) ?? 100,
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

// Simplified schema for OpenAI - all fields must be required
// Only supporting move operations for now (most common use case)
const moveOperationSchema = z.object({
  bookmarkId: z.string().describe('ID of bookmark to move'),
  bookmarkTitle: z.string().describe('Title of the bookmark'),
  toFolderPath: z.string().describe('Target folder path'),
  confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1'),
  reason: z.string().describe('Why move this bookmark (do not include confidence here)'),
});

const reorganizationResultSchema = z.object({
  operations: z.array(moveOperationSchema).describe('List of bookmark moves'),
  summary: z.string().describe('Brief summary of reorganization'),
});

// ============================================================================
// Helper Functions
// ============================================================================

export function collectBookmarks(
  nodes: BookmarkTreeNode[],
  parentPath = '',
  parentId = ''
): BookmarkInfo[] {
  const result: BookmarkInfo[] = [];
  aiLogger.debug({ nodesCount: nodes.length }, 'collectBookmarks called');
  for (const node of nodes) {
    const currentPath = parentPath && node.title 
      ? `${parentPath}/${node.title}` 
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
      result.push(...collectBookmarks(
        node.children, 
        node.url ? parentPath : currentPath,
        node.id
      ));
    }
  }
  return result;
}

export function collectFolders(
  nodes: BookmarkTreeNode[],
  parentPath = ''
): FolderInfo[] {
  const result: FolderInfo[] = [];
  for (const node of nodes) {
    if (node.url) continue;
    const currentPath = parentPath && node.title 
      ? `${parentPath}/${node.title}` 
      : node.title || '';
    if (node.title) {
      const bookmarkCount = node.children?.filter(c => c.url).length ?? 0;
      result.push({ id: node.id, title: node.title, path: currentPath, bookmarkCount });
    }
    if (node.children) {
      result.push(...collectFolders(node.children, currentPath));
    }
  }
  return result;
}

export function findFolderByPath(
  folders: FolderInfo[],
  path: string
): FolderInfo | undefined {
  return folders.find(f => f.path === path);
}

// ============================================================================
// Main Service
// ============================================================================

export async function generateReorganizationPlan(
  bookmarks: BookmarkTreeNode[],
  settings: AISettings,
  config?: Partial<ReorganizationConfig>,
): Promise<ReorganizationPlan> {
  const cfg = resolveReorgConfig(config);
  validateAISettings(settings);

  aiLogger.info({ inputNodes: bookmarks.length }, 'Starting reorganization plan generation');

  const allBookmarks = collectBookmarks(bookmarks);
  const allFolders = collectFolders(bookmarks);

  aiLogger.debug({ 
    bookmarkCount: allBookmarks.length, 
    folderCount: allFolders.length,
    config: cfg 
  }, 'Collected bookmarks and folders');

  if (allBookmarks.length === 0) {
    aiLogger.warn('No bookmarks found in scope');
    throw new Error('No bookmarks found in the selected scope. Select "All Bookmarks" or choose a folder with bookmarks.');
  }

  const { system } = buildPrompt('folder_reorganization', {
    maxCategories: cfg.maxCategories,
    minItemsPerFolder: cfg.minItemsPerFolder,
    maxItemsPerFolder: cfg.maxItemsPerFolder,
  });

  aiLogger.debug({ provider: settings.provider, model: settings.model }, 'Creating AI model');
  const model = createAIModel(settings);

  aiLogger.info({ provider: settings.provider, model: settings.model }, 'Calling AI for reorganization');

  const bookmarkBatches = chunkItems(allBookmarks, cfg.batchSize);
  const batchResults = [];

  for (const bookmarkBatch of bookmarkBatches) {
    const request = {
      bookmarks: bookmarkBatch.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        currentFolder: bookmark.currentFolderPath,
      })),
      folders: allFolders.map((folder) => ({
        path: folder.path,
        bookmarkCount: folder.bookmarkCount,
      })),
      config: {
        maxCategories: cfg.maxCategories,
        minItemsPerFolder: cfg.minItemsPerFolder,
        maxItemsPerFolder: cfg.maxItemsPerFolder,
      },
    };
    const { object } = await generateObject({
      model,
      schema: reorganizationResultSchema,
      system,
      prompt: JSON.stringify(request),
    });

    batchResults.push({ request, response: object, bookmarkBatch });
  }

  const returnedOperations = batchResults.flatMap(({ response }) => response.operations);
  aiLogger.info(
    { operationsCount: returnedOperations.length, batchCount: batchResults.length },
    'AI returned operations',
  );

  const seenBookmarkIds = new Set<string>();
  let excludedLowConfidence = 0;
  const operations: ReorganizationOperation[] = batchResults.flatMap(
    ({ response, bookmarkBatch }) => {
      const batchBookmarkIds = new Set(bookmarkBatch.map((bookmark) => bookmark.id));
      return response.operations.flatMap((op) => {
        if (op.confidence < cfg.minConfidence) {
          excludedLowConfidence += 1;
          return [];
        }

        const bookmark = allBookmarks.find((b) => b.id === op.bookmarkId);
        if (
          !bookmark ||
          !batchBookmarkIds.has(op.bookmarkId) ||
          seenBookmarkIds.has(op.bookmarkId)
        ) {
          return [];
        }

        const targetFolder = findFolderByPath(allFolders, op.toFolderPath);
        if (bookmark.currentFolderPath === op.toFolderPath) {
          return [];
        }

        seenBookmarkIds.add(op.bookmarkId);
        return [
          {
            type: 'move' as const,
            bookmarkId: op.bookmarkId,
            bookmarkTitle: bookmark.title,
            bookmarkUrl: bookmark.url,
            fromFolderPath: bookmark.currentFolderPath,
            toFolderPath: op.toFolderPath,
            toFolderId: targetFolder?.id,
            confidence: op.confidence,
            reason: op.reason,
          } satisfies MoveBookmarkOp,
        ];
      });
    },
  );

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
      dryRunFirst: cfg.dryRunFirst,
      minConfidence: cfg.minConfidence,
      batchSize: cfg.batchSize,
      batchCount: batchResults.length,
      excludedLowConfidence,
    },
    debugData: {
      request: batchResults.map(({ request }) => request),
      response: batchResults.map(({ response }) => response),
      systemPrompt: system,
    },
  };
}

/**
 * Apply a reorganization plan (with user confirmation).
 */
export async function applyReorganizationPlan(
  plan: ReorganizationPlan,
  options: ApplyReorganizationOptions = {},
): Promise<ApplyReorganizationResult> {
  const { previewConfirmed = false } = options;
  const config = resolveReorgConfig({
    dryRunFirst: plan.safety.dryRunFirst,
    minConfidence: plan.safety.minConfidence,
    batchSize: plan.safety.batchSize,
  });
  const errors: string[] = [];
  const createdFolders = new Map<string, string>(); // path -> id
  const operations = plan.operations.filter((operation) => {
    return operation.type !== 'move' || operation.confidence >= config.minConfidence;
  });
  const skipped = plan.operations.length - operations.length;
  let applied = 0;

  if (config.dryRunFirst && !previewConfirmed) {
    return {
      success: false,
      errors: ['Preview must be confirmed before applying reorganization changes'],
      applied,
      skipped,
    };
  }

  // Preserve operation order while limiting each mutation batch to the configured size.
  for (const operationBatch of chunkItems(operations, config.batchSize)) {
    for (const op of operationBatch) {
      try {
        switch (op.type) {
          case 'create': {
            let parentId = '1'; // Default to Bookmarks Bar
            if (op.parentPath) {
              const existing = createdFolders.get(op.parentPath);
              if (existing) parentId = existing;
            }
            const created = await browser.bookmarks.create({ parentId, title: op.name });
            const fullPath = op.parentPath ? `${op.parentPath}/${op.name}` : op.name;
            createdFolders.set(fullPath, created.id);
            break;
          }
          case 'delete': {
            if (op.folderId) {
              await browser.bookmarks.removeTree(op.folderId);
            }
            break;
          }
          case 'rename': {
            if (op.folderId) {
              await browser.bookmarks.update(op.folderId, { title: op.newName });
            }
            break;
          }
          case 'move': {
            let targetId = op.toFolderId;
            if (!targetId) {
              targetId = createdFolders.get(op.toFolderPath);
            }
            if (targetId) {
              await browser.bookmarks.move(op.bookmarkId, { parentId: targetId });
            } else {
              errors.push(`Cannot find target folder for "${op.bookmarkTitle}"`);
              continue;
            }
            break;
          }
        }
        applied += 1;
      } catch (err) {
        errors.push(`${op.type} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  return { success: errors.length === 0, errors, applied, skipped };
}

/**
 * Get plan summary for preview UI.
 */
export function getPlanSummary(plan: ReorganizationPlan) {
  const creates = plan.operations.filter(o => o.type === 'create').length;
  const deletes = plan.operations.filter(o => o.type === 'delete').length;
  const renames = plan.operations.filter(o => o.type === 'rename').length;
  const moves = plan.operations.filter(o => o.type === 'move').length;
  return { creates, deletes, renames, moves, total: plan.operations.length };
}
