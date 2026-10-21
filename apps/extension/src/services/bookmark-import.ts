/**
 * Bookmark Import Service
 * Extensible import with strategy pattern for multiple formats.
 */

import { browserHasSeparators, isSeparatorNode } from '@/lib/bookmark-separators';
import type { BookmarkTreeNode } from '@/types';

// ============================================================================
// Import Format Interface (Strategy Pattern)
// ============================================================================

export interface ParsedImport {
  /** Parsed bookmark tree */
  bookmarks: BookmarkTreeNode[];
  /** Entries dropped because they were not valid bookmarks or folders */
  skipped: number;
  /**
   * Tags and summaries from a JSON export, by the id the parsed entry has here: each bookmark's
   * own, also when several share a URL. Given to the bookmark the import creates from that entry.
   */
  metadataById?: Record<string, StoredBookmarkMetadata>;
  /** Tags and summaries by URL, from an export made before they were kept per entry. */
  metadataByUrl?: Record<string, StoredBookmarkMetadata>;
}

export interface ImportResult extends ParsedImport {
  /** Number of bookmarks found */
  bookmarkCount: number;
  /** Number of folders found */
  folderCount: number;
}

export interface ImportFormat {
  /** Display name of the format */
  name: string;
  /** Supported file extensions (without dot) */
  extensions: string[];
  /** MIME types to accept */
  mimeTypes: string[];
  /** Parse content and return the bookmark tree plus the number of skipped entries */
  parse(content: string): ParsedImport;
}

// ============================================================================
// Built-in Format Parsers
// ============================================================================

/** Parsed nodes get ids with this prefix; they are never browser bookmark ids. */
const IMPORTED_ID_PREFIX = 'imported-';

/** A fresh id source for one parse, unique within the file and across parses. */
function createImportIdGenerator(): () => string {
  const started = Date.now();
  let counter = 0;
  return () => `${IMPORTED_ID_PREFIX}${started}-${++counter}`;
}

/**
 * A URL the browser can store. Anything else would only fail when the import is applied, so the
 * parsers drop it as an invalid entry the preview counts.
 */
function isImportableUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** Netscape files store dates as Unix seconds. */
function parseNetscapeDate(value: string | null): number {
  // Not a `cond ? x * MS_PER_SECOND : y` ternary: WXT's auto-import skips an identifier right
  // before `:` as if it were an object key, which leaves it undefined at runtime.
  if (!value) return Date.now();
  return parseInt(value, 10) * MS_PER_SECOND;
}

/**
 * Chrome/Netscape HTML format parser
 */
export const htmlImportFormat: ImportFormat = {
  name: 'HTML (Chrome/Netscape)',
  extensions: ['html', 'htm'],
  mimeTypes: ['text/html'],
  parse(content: string): ParsedImport {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const result: BookmarkTreeNode[] = [];
    let skipped = 0;

    const generateId = createImportIdGenerator();

    const parseBookmark = (element: Element, parentId?: string): BookmarkTreeNode | null => {
      const url = element.getAttribute('HREF')?.trim();
      if (!url || !isImportableUrl(url)) {
        skipped += 1;
        return null;
      }
      return {
        id: generateId(),
        parentId,
        title: getBookmarkDisplayTitle(element.textContent?.trim()),
        url,
        dateAdded: parseNetscapeDate(element.getAttribute('ADD_DATE')),
      };
    };

    // The file is read in document order, by its A, H3, HR, and DL elements only: parsers nest
    // the unclosed <DT> and <p> differently (a browser puts a folder's <DL>, and an <HR> after an
    // item, inside that item's <DT>), but the order of those four is the same everywhere. A <DL>
    // right after an <H3> holds that folder's items.
    let folderAwaitingItems: BookmarkTreeNode | undefined;
    const folders: BookmarkTreeNode[] = [];
    const walk = (element: Element, list: BookmarkTreeNode[], parentId?: string): void => {
      for (const child of Array.from(element.children)) {
        switch (child.tagName) {
          case 'A': {
            folderAwaitingItems = undefined;
            const node = parseBookmark(child, parentId);
            if (node) list.push(node);
            break;
          }
          case 'H3': {
            const folder: BookmarkTreeNode = {
              id: generateId(),
              parentId,
              title: getBookmarkDisplayTitle(child.textContent?.trim()),
              dateAdded: parseNetscapeDate(child.getAttribute('ADD_DATE')),
              children: [],
            };
            list.push(folder);
            folders.push(folder);
            folderAwaitingItems = folder;
            break;
          }
          case 'HR':
            // The Netscape separator, which Firefox writes.
            folderAwaitingItems = undefined;
            list.push({ id: generateId(), parentId, title: '', type: 'separator' });
            break;
          case 'DL': {
            const folder = folderAwaitingItems;
            folderAwaitingItems = undefined;
            if (folder?.children) walk(child, folder.children, folder.id);
            else walk(child, list, parentId);
            break;
          }
          default:
            walk(child, list, parentId);
        }
      }
    };

    // The items start at the first <DL> (anything before it, like the <H1> title, is not one).
    const mainDL = doc.querySelector('DL');
    if (mainDL) walk(mainDL, result);
    // An empty folder has no children list, like a folder parsed from JSON.
    for (const folder of folders) {
      if (folder.children?.length === 0) folder.children = undefined;
    }

    return { bookmarks: result, skipped };
  },
};

/**
 * JSON format parser
 */
export const jsonImportFormat: ImportFormat = {
  name: 'JSON',
  extensions: ['json'],
  mimeTypes: ['application/json'],
  parse(content: string): ParsedImport {
    let skipped = 0;
    const generateId = createImportIdGenerator();
    const metadataById: Record<string, StoredBookmarkMetadata> = {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(t('error_invalidJsonFormat'));
    }

    // Invalid entries are skipped and counted so one bad item never rejects the whole file.
    const parseRawNode = (raw: unknown, parentId?: string): BookmarkTreeNode | null => {
      if (!isPlainObject(raw)) {
        skipped += 1;
        return null;
      }
      if (raw.type === 'separator') {
        return {
          id: generateId(),
          parentId,
          title: '',
          type: 'separator',
          ...(typeof raw.dateAdded === 'number' ? { dateAdded: raw.dateAdded } : {}),
        };
      }
      const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : undefined;
      const rawChildren = Array.isArray(raw.children) ? raw.children : undefined;
      if (raw.url !== undefined && (!url || !isImportableUrl(url))) {
        skipped += 1;
        return null;
      }
      if (!url && !rawChildren && typeof raw.title !== 'string') {
        skipped += 1;
        return null;
      }

      const id = generateId();
      const node: BookmarkTreeNode = {
        id,
        parentId,
        title: getBookmarkDisplayTitle(typeof raw.title === 'string' ? raw.title : undefined),
        url,
        dateAdded: typeof raw.dateAdded === 'number' ? raw.dateAdded : undefined,
        dateGroupModified:
          typeof raw.dateGroupModified === 'number' ? raw.dateGroupModified : undefined,
      };

      // An exported bookmark carries its own tags and summary.
      const metadata = url ? parseBookmarkMetadata({ [id]: raw })[id] : undefined;
      if (metadata) metadataById[id] = metadata;

      if (!url && rawChildren) {
        node.children = rawChildren
          .map((child) => parseRawNode(child, id))
          .filter((child): child is BookmarkTreeNode => child !== null);
      }

      return node;
    };

    const parseList = (items: unknown[]) =>
      items
        .map((item) => parseRawNode(item, undefined))
        .filter((node): node is BookmarkTreeNode => node !== null);

    let bookmarks: BookmarkTreeNode[];
    let metadataByUrl: Record<string, StoredBookmarkMetadata> | undefined;
    if (Array.isArray(parsed)) {
      bookmarks = parseList(parsed);
    } else if (isPlainObject(parsed) && Array.isArray(parsed.children) && !parsed.url) {
      // An exported container: its children are the top-level entries.
      bookmarks = parseList(parsed.children);
      const byUrl = parseBookmarkMetadata(parsed.metadata);
      if (Object.keys(byUrl).length > 0) metadataByUrl = byUrl;
    } else {
      bookmarks = parseList([parsed]);
    }
    return {
      bookmarks,
      skipped,
      ...(Object.keys(metadataById).length > 0 ? { metadataById } : {}),
      ...(metadataByUrl ? { metadataByUrl } : {}),
    };
  },
};

// ============================================================================
// Format Registry
// ============================================================================

export const importFormats: Record<string, ImportFormat> = {
  html: htmlImportFormat,
  json: jsonImportFormat,
};

// ============================================================================
// Import Functions
// ============================================================================

/**
 * Detect format from file extension
 */
export function detectFormat(filename: string): ImportFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  for (const format of Object.values(importFormats)) {
    if (format.extensions.includes(ext)) {
      return format;
    }
  }

  return null;
}

/**
 * Parse file content and return bookmarks
 */
export function parseBookmarks(content: string, format: ImportFormat): ImportResult {
  const { bookmarks, skipped, metadataById, metadataByUrl } = format.parse(content);

  // Count items
  let bookmarkCount = 0;
  let folderCount = 0;

  const countItems = (nodes: BookmarkTreeNode[]): void => {
    for (const node of nodes) {
      if (isSeparatorNode(node)) continue;
      if (node.url) {
        bookmarkCount++;
      } else {
        folderCount++;
      }
      if (node.children) {
        countItems(node.children);
      }
    }
  };

  countItems(bookmarks);

  return {
    bookmarks,
    skipped,
    bookmarkCount,
    folderCount,
    ...(metadataById ? { metadataById } : {}),
    ...(metadataByUrl ? { metadataByUrl } : {}),
  };
}

// ============================================================================
// Import Preview (dry run) and Apply
// ============================================================================

/**
 * How bookmarks whose URL already exists are handled:
 * - `skip-anywhere`: skip URLs found anywhere in the browser or earlier in the file.
 * - `skip-in-target`: skip URLs already inside the target folder or earlier in the file.
 * - `import-all`: create everything, duplicates included.
 */
export type ImportDuplicateStrategy = 'skip-anywhere' | 'skip-in-target' | 'import-all';

export const IMPORT_DUPLICATE_STRATEGIES: readonly ImportDuplicateStrategy[] = [
  'skip-anywhere',
  'skip-in-target',
  'import-all',
];

/** The strategy a new import preview starts with: never create a URL the browser already has. */
export const DEFAULT_IMPORT_DUPLICATE_STRATEGY: ImportDuplicateStrategy = 'skip-anywhere';

/** Where an imported URL already exists. `in-target` includes the target's subfolders. */
export type ImportConflictKind = 'in-target' | 'elsewhere' | 'in-file';

export type ImportPlanNode = {
  title: string;
  url?: string;
  /** A Firefox separator; created only where the browser has separators. */
  type?: 'separator';
  action: 'create' | 'skip';
  /** Set when the URL already exists, whether or not the strategy skips it. */
  conflict?: ImportConflictKind;
  /** Tags and summary the created bookmark gets. */
  metadata?: StoredBookmarkMetadata;
  children?: ImportPlanNode[];
};

export type ImportConflict = {
  /** The entry's id in the parsed file, unique within one import even when URLs repeat. */
  id: string;
  title: string;
  url: string;
  kind: ImportConflictKind;
  skipped: boolean;
};

export type ImportPlanCounts = {
  bookmarksToCreate: number;
  foldersToCreate: number;
  bookmarksToSkip: number;
  /** Folders left out because every item inside them is skipped. */
  foldersToSkip: number;
  /** Entries the parser dropped because they were not valid bookmarks or folders. */
  invalid: number;
  separatorsToCreate: number;
  /** Separators left out because this browser has none (Chrome, Edge). */
  separatorsUnsupported: number;
  duplicatesInTarget: number;
  duplicatesElsewhere: number;
  duplicatesInFile: number;
};

export type ImportPlan = {
  targetFolderId: string;
  strategy: ImportDuplicateStrategy;
  nodes: ImportPlanNode[];
  counts: ImportPlanCounts;
  conflicts: ImportConflict[];
};

export type ImportTarget = { id: string; label: string };

export type ImportApplyOutcome = {
  bookmarksCreated: number;
  foldersCreated: number;
  /** Items the plan skipped plus entries the parser dropped. */
  skipped: number;
  /** Items the browser rejected, including the planned contents of folders that failed. */
  failed: number;
  errors: string[];
  /** Every created ID. */
  createdIds: string[];
  /** IDs of the created items directly inside the target folder. */
  createdRootIds: string[];
  /**
   * Removes what the import created, once. A top-level item is removed only while it is exactly
   * as the import left it (place, titles, addresses, tags, summaries, and contents at every
   * depth), so later work in it is never deleted. A later call returns the first call's result.
   */
  undo(): Promise<ImportUndoResult>;
};

export type ImportUndoResult = { removed: number; failed: number };

function collectTreeUrls(nodes: readonly BookmarkTreeNode[], urls: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.url) urls.add(node.url);
    collectTreeUrls(node.children ?? [], urls);
  }
  return urls;
}

/**
 * Folders an import can write to, in browser order, labelled with their full path. The
 * invisible root and managed (unmodifiable) folders are excluded.
 */
export function listImportTargets(tree: readonly BookmarkTreeNode[]): ImportTarget[] {
  const targets: ImportTarget[] = [];
  const visit = (nodes: readonly BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) continue;
      const isRoot = !node.parentId;
      const nodePath = isRoot ? path : [...path, getBookmarkDisplayTitle(node.title.trim())];
      if (!isRoot && !node.unmodifiable) {
        targets.push({ id: node.id, label: nodePath.join(FOLDER_PATH_SEPARATOR) });
      }
      visit(node.children ?? [], nodePath);
    }
  };
  visit(tree, []);
  return targets;
}

/**
 * Builds a dry-run plan of what importing into `targetFolderId` would create or skip. Pure:
 * never touches the browser. Throws when the target is not a writable folder in `tree`.
 */
export function planImport(
  parsed: ParsedImport,
  tree: readonly BookmarkTreeNode[],
  targetFolderId: string,
  strategy: ImportDuplicateStrategy,
): ImportPlan {
  const target = findNode(tree, targetFolderId);
  if (!target || target.url || !target.parentId || target.unmodifiable) {
    throw new Error(t('tools_importTargetMissing'));
  }

  const targetUrls = collectTreeUrls(target.children ?? [], new Set());
  const allUrls = collectTreeUrls(tree, new Set());
  const seenInFile = new Set<string>();
  const counts: ImportPlanCounts = {
    bookmarksToCreate: 0,
    foldersToCreate: 0,
    bookmarksToSkip: 0,
    foldersToSkip: 0,
    invalid: parsed.skipped,
    separatorsToCreate: 0,
    separatorsUnsupported: 0,
    duplicatesInTarget: 0,
    duplicatesElsewhere: 0,
    duplicatesInFile: 0,
  };
  const conflicts: ImportConflict[] = [];

  // Repeats within the file land in the target too, so both skip strategies drop them.
  const shouldSkip = (kind: ImportConflictKind) =>
    strategy === 'skip-anywhere' || (strategy === 'skip-in-target' && kind !== 'elsewhere');

  const detectConflict = (url: string): ImportConflictKind | undefined => {
    if (targetUrls.has(url)) return 'in-target';
    if (allUrls.has(url)) return 'elsewhere';
    if (seenInFile.has(url)) return 'in-file';
    return undefined;
  };

  const separators = browserHasSeparators();
  const planNode = (node: BookmarkTreeNode): ImportPlanNode => {
    if (isSeparatorNode(node)) {
      if (separators) counts.separatorsToCreate += 1;
      else counts.separatorsUnsupported += 1;
      return { title: '', type: 'separator', action: separators ? 'create' : 'skip' };
    }
    if (node.url) {
      const url = node.url;
      const conflict = detectConflict(url);
      seenInFile.add(url);
      const skip = conflict !== undefined && shouldSkip(conflict);
      if (conflict === 'in-target') counts.duplicatesInTarget += 1;
      if (conflict === 'elsewhere') counts.duplicatesElsewhere += 1;
      if (conflict === 'in-file') counts.duplicatesInFile += 1;
      if (conflict) {
        conflicts.push({ id: node.id, title: node.title, url, kind: conflict, skipped: skip });
      }
      if (skip) counts.bookmarksToSkip += 1;
      else counts.bookmarksToCreate += 1;
      const metadata = parsed.metadataById?.[node.id] ?? parsed.metadataByUrl?.[url];
      return {
        title: node.title,
        url,
        action: skip ? 'skip' : 'create',
        ...(conflict ? { conflict } : {}),
        ...(metadata ? { metadata } : {}),
      };
    }

    const children = (node.children ?? []).map(planNode);
    // A folder whose every item is skipped would only add an empty shell; folders that are
    // empty in the file are still created as the file describes them.
    const skip = children.length > 0 && children.every((child) => child.action === 'skip');
    if (skip) counts.foldersToSkip += 1;
    else counts.foldersToCreate += 1;
    return {
      title: node.title,
      action: skip ? 'skip' : 'create',
      ...(children.length > 0 ? { children } : {}),
    };
  };

  return {
    targetFolderId,
    strategy,
    nodes: parsed.bookmarks.map(planNode),
    counts,
    conflicts,
  };
}

/** True when two plans make the same changes; used to detect a preview made stale. */
export function isSameImportPlan(left: ImportPlan, right: ImportPlan): boolean {
  return (
    left.targetFolderId === right.targetFolderId &&
    left.strategy === right.strategy &&
    JSON.stringify(left.nodes) === JSON.stringify(right.nodes)
  );
}

function countPlanned(node: ImportPlanNode): number {
  if (node.action === 'skip') return 0;
  return 1 + (node.children ?? []).reduce((total, child) => total + countPlanned(child), 0);
}

/**
 * Creates the items a plan marks `create`. Every item is attempted; failures are counted (a
 * failed folder counts its planned subtree) rather than reported as success.
 */
export async function applyImportPlan(plan: ImportPlan): Promise<ImportApplyOutcome> {
  const outcome: Omit<ImportApplyOutcome, 'undo'> = {
    bookmarksCreated: 0,
    foldersCreated: 0,
    skipped:
      plan.counts.bookmarksToSkip +
      plan.counts.foldersToSkip +
      plan.counts.invalid +
      plan.counts.separatorsUnsupported,
    failed: 0,
    errors: [],
    createdIds: [],
    createdRootIds: [],
  };

  const metadata: Record<string, StoredBookmarkMetadata> = {};
  // Titles of the entries the browser rejected, for the History (never the raw error text).
  const failedTitles: string[] = [];
  const createNode = async (
    writer: BookmarkWriter,
    node: ImportPlanNode,
    parentId: string,
    isTopLevel: boolean,
  ) => {
    if (node.action === 'skip') return;
    try {
      const created = await writer.create({
        parentId,
        title: node.title,
        ...(node.type ? { type: node.type } : node.url ? { url: node.url } : {}),
      });
      outcome.createdIds.push(created.id);
      if (isTopLevel) outcome.createdRootIds.push(created.id);
      if (node.type) return;
      if (node.url) {
        outcome.bookmarksCreated += 1;
        if (node.metadata) metadata[created.id] = node.metadata;
        return;
      }
      outcome.foldersCreated += 1;
      for (const child of node.children ?? []) {
        await createNode(writer, child, created.id, false);
      }
    } catch (err) {
      outcome.failed += countPlanned(node);
      failedTitles.push(node.title);
      // Named, so the user can tell which entry of the file to fix.
      outcome.errors.push(
        t('tools_importItemFailed', [getBookmarkDisplayTitle(node.title), getErrorMessage(err)]),
      );
    }
  };

  // One History record (and one undo history entry) for the whole import, with what failed.
  await recordBookmarkWrites(
    () => ({ action: 'add', count: Math.max(1, outcome.createdIds.length), tool: 'tools_import' }),
    async (writer) => {
      for (const node of plan.nodes) {
        await createNode(writer, node, plan.targetFolderId, true);
      }
    },
    {
      source: 'import',
      report: () => ({
        planned: outcome.createdIds.length + outcome.failed,
        skipped: failedTitles.map((title, index) => ({
          id: `import-failed-${index}`,
          title,
          reason: 'failed',
          failed: true,
        })),
      }),
    },
  );
  if (Object.keys(metadata).length > 0) {
    try {
      await mergeStoredBookmarkMetadata(metadata, {
        tagMode: 'replace',
        summaryMode: 'replace',
        dedupeTags: true,
      });
    } catch (err) {
      outcome.errors.push(getErrorMessage(err));
    }
  }
  // What the import left, read back (with tags and summaries), so undo can tell any later change.
  const imported = await Promise.all(
    outcome.createdRootIds.map((id) =>
      captureBookmarkSubtree(id, { keepIds: true }).catch(() => null),
    ),
  );
  let undone: Promise<ImportUndoResult> | undefined;
  return {
    ...outcome,
    undo: () => (undone ??= removeImported(plan.targetFolderId, imported)),
  };
}

/**
 * Removes each top-level item the import created, but only while it is exactly as the import
 * left it: still in the target folder, with the same titles, addresses, tags, summaries, and
 * items at every depth. Anything edited, moved, re-tagged, or added to since is the user's work
 * and stays; it counts as not removed.
 */
async function removeImported(
  targetFolderId: string,
  imported: readonly (BookmarkSubtreeSnapshot | null)[],
): Promise<ImportUndoResult> {
  const result = await applyBookmarkChanges(
    imported.flatMap((snapshot) =>
      snapshot?.node.id
        ? [
            {
              kind: 'remove' as const,
              id: snapshot.node.id,
              title: snapshot.node.title,
              expect: { parentId: targetFolderId },
              // Undoing an import is itself not undone; the user can import the file again.
              undoable: false,
              check: async () => {
                const live = await captureBookmarkSubtree(snapshot.node.id ?? '', {
                  keepIds: true,
                }).catch(() => null);
                return live !== null && isSameRecordedSubtree(snapshot.node, live.node);
              },
            },
          ]
        : [],
    ),
  );
  const unreadable = imported.filter((snapshot) => !snapshot?.node.id).length;
  // An item that changed since the import counts as not removed, like a browser failure.
  return { removed: result.applied, failed: result.skipped + result.failed + unreadable };
}

/**
 * Read file and parse bookmarks
 */
export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(t('error_readFileFailed')));
    reader.readAsText(file);
  });
}

/**
 * Get accepted file types string for input element
 */
export function getAcceptedFileTypes(): string {
  const extensions = Object.values(importFormats)
    .flatMap((f) => f.extensions)
    .map((ext) => `.${ext}`);
  const mimeTypes = Object.values(importFormats).flatMap((f) => f.mimeTypes);
  return [...new Set([...extensions, ...mimeTypes])].join(',');
}
