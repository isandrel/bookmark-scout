/**
 * Bookmark Import Service
 * Extensible import with strategy pattern for multiple formats.
 */

import type { BookmarkTreeNode } from '@/types';

// ============================================================================
// Import Format Interface (Strategy Pattern)
// ============================================================================

export interface ParsedImport {
  /** Parsed bookmark tree */
  bookmarks: BookmarkTreeNode[];
  /** Entries dropped because they were not valid bookmarks or folders */
  skipped: number;
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

    const parseNode = (element: Element, parentId?: string): BookmarkTreeNode | null => {
      // Handle <A> tags (bookmarks)
      if (element.tagName === 'A') {
        const url = element.getAttribute('HREF')?.trim();
        if (!url) {
          skipped += 1;
          return null;
        }
        const title = getBookmarkDisplayTitle(element.textContent?.trim());
        const dateAdded = element.getAttribute('ADD_DATE');

        return {
          id: generateId(),
          parentId,
          title,
          url,
          dateAdded: parseNetscapeDate(dateAdded),
        };
      }

      // Handle <H3> tags (folders)
      if (element.tagName === 'H3') {
        const title = getBookmarkDisplayTitle(element.textContent?.trim());
        const dateAdded = element.getAttribute('ADD_DATE');
        const id = generateId();

        // Find the sibling <DL> that contains the folder's children
        let sibling = element.closest('DT')?.nextElementSibling;
        // May also be nested within the same DT
        if (!sibling || sibling.tagName !== 'DL') {
          sibling = element.closest('DT')?.querySelector('DL');
        }

        const children: BookmarkTreeNode[] = [];
        if (sibling && sibling.tagName === 'DL') {
          const dtElements = sibling.querySelectorAll(':scope > DT');
          dtElements.forEach((dt) => {
            const anchor = dt.querySelector(':scope > A');
            const heading = dt.querySelector(':scope > H3');
            if (anchor) {
              const child = parseNode(anchor, id);
              if (child) children.push(child);
            } else if (heading) {
              const child = parseNode(heading, id);
              if (child) children.push(child);
            }
          });
        }

        return {
          id,
          parentId,
          title,
          dateAdded: parseNetscapeDate(dateAdded),
          children: children.length > 0 ? children : undefined,
        };
      }

      return null;
    };

    // Find the main <DL> (may be nested within body or directly)
    const mainDL = doc.querySelector('DL');
    if (mainDL) {
      const dtElements = mainDL.querySelectorAll(':scope > DT');
      dtElements.forEach((dt) => {
        const anchor = dt.querySelector(':scope > A');
        const heading = dt.querySelector(':scope > H3');
        if (anchor) {
          const node = parseNode(anchor, undefined);
          if (node) result.push(node);
        } else if (heading) {
          const node = parseNode(heading, undefined);
          if (node) result.push(node);
        }
      });
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
      const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : undefined;
      const rawChildren = Array.isArray(raw.children) ? raw.children : undefined;
      if (raw.url !== undefined && !url) {
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
    if (Array.isArray(parsed)) {
      bookmarks = parseList(parsed);
    } else if (isPlainObject(parsed) && Array.isArray(parsed.children) && !parsed.url) {
      // An exported container: its children are the top-level entries.
      bookmarks = parseList(parsed.children);
    } else {
      bookmarks = parseList([parsed]);
    }
    return { bookmarks, skipped };
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
export function parseBookmarks(
  content: string,
  format: ImportFormat
): ImportResult {
  const { bookmarks, skipped } = format.parse(content);

  // Count items
  let bookmarkCount = 0;
  let folderCount = 0;

  const countItems = (nodes: BookmarkTreeNode[]): void => {
    for (const node of nodes) {
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
  action: 'create' | 'skip';
  /** Set when the URL already exists, whether or not the strategy skips it. */
  conflict?: ImportConflictKind;
  children?: ImportPlanNode[];
};

export type ImportConflict = {
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
  /** Every created ID, used to check that an undo only removes imported items. */
  createdIds: string[];
  /** IDs of the created items directly inside the target folder. */
  createdRootIds: string[];
  /**
   * Removes what the import created, once. A top-level item is removed only while its subtree
   * holds nothing but imported items, so bookmarks added to an imported folder are never
   * deleted. A later call returns the first call's result.
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

  const planNode = (node: BookmarkTreeNode): ImportPlanNode => {
    if (node.url) {
      const url = node.url;
      const conflict = detectConflict(url);
      seenInFile.add(url);
      const skip = conflict !== undefined && shouldSkip(conflict);
      if (conflict === 'in-target') counts.duplicatesInTarget += 1;
      if (conflict === 'elsewhere') counts.duplicatesElsewhere += 1;
      if (conflict === 'in-file') counts.duplicatesInFile += 1;
      if (conflict) conflicts.push({ title: node.title, url, kind: conflict, skipped: skip });
      if (skip) counts.bookmarksToSkip += 1;
      else counts.bookmarksToCreate += 1;
      return {
        title: node.title,
        url,
        action: skip ? 'skip' : 'create',
        ...(conflict ? { conflict } : {}),
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
    skipped: plan.counts.bookmarksToSkip + plan.counts.foldersToSkip + plan.counts.invalid,
    failed: 0,
    errors: [],
    createdIds: [],
    createdRootIds: [],
  };

  const createNode = async (node: ImportPlanNode, parentId: string, isTopLevel: boolean) => {
    if (node.action === 'skip') return;
    try {
      const created = await createBookmark({
        parentId,
        title: node.title,
        ...(node.url ? { url: node.url } : {}),
      });
      outcome.createdIds.push(created.id);
      if (isTopLevel) outcome.createdRootIds.push(created.id);
      if (node.url) {
        outcome.bookmarksCreated += 1;
        return;
      }
      outcome.foldersCreated += 1;
      for (const child of node.children ?? []) {
        await createNode(child, created.id, false);
      }
    } catch (err) {
      outcome.failed += countPlanned(node);
      outcome.errors.push(err instanceof Error ? err.message : t('error_unknown'));
    }
  };

  for (const node of plan.nodes) {
    await createNode(node, plan.targetFolderId, true);
  }
  let undone: Promise<ImportUndoResult> | undefined;
  return { ...outcome, undo: () => (undone ??= removeImported(outcome)) };
}

async function removeImported(
  outcome: Pick<ImportApplyOutcome, 'createdIds' | 'createdRootIds'>,
): Promise<ImportUndoResult> {
  const created = new Set(outcome.createdIds);
  const result = await applyBookmarkChanges(
    outcome.createdRootIds.map((id) => ({
      kind: 'remove',
      id,
      title: '',
      // Undoing an import is itself not undone; the user can import the file again.
      undoable: false,
      check: (live) => subtreeIds(live).every((itemId) => created.has(itemId)),
    })),
  );
  // An item that changed since the import counts as not removed, like a browser failure.
  return { removed: result.applied, failed: result.skipped + result.failed };
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
