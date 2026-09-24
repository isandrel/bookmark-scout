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

export interface ImportOutcome {
  bookmarksCreated: number;
  foldersCreated: number;
  /** Items the browser rejected, including the contents of folders that failed */
  failed: number;
  errors: string[];
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

    let idCounter = 0;
    const generateId = () => `imported-${Date.now()}-${++idCounter}`;

    const parseNode = (element: Element, parentId?: string): BookmarkTreeNode | null => {
      // Handle <A> tags (bookmarks)
      if (element.tagName === 'A') {
        const url = element.getAttribute('HREF')?.trim();
        if (!url) {
          skipped += 1;
          return null;
        }
        const title = element.textContent?.trim() || t('bookmarks_untitled');
        const dateAdded = element.getAttribute('ADD_DATE');

        return {
          id: generateId(),
          parentId,
          title,
          url,
          dateAdded: dateAdded ? parseInt(dateAdded, 10) * 1000 : Date.now(),
        };
      }

      // Handle <H3> tags (folders)
      if (element.tagName === 'H3') {
        const title = element.textContent?.trim() || t('bookmarks_untitled');
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
          dateAdded: dateAdded ? parseInt(dateAdded, 10) * 1000 : Date.now(),
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
    let idCounter = 0;
    let skipped = 0;
    const generateId = () => `imported-${Date.now()}-${++idCounter}`;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(t('error_invalidJsonFormat'));
    }

    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);

    // Invalid entries are skipped and counted so one bad item never rejects the whole file.
    const parseRawNode = (raw: unknown, parentId?: string): BookmarkTreeNode | null => {
      if (!isRecord(raw)) {
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
        title: typeof raw.title === 'string' && raw.title ? raw.title : t('bookmarks_untitled'),
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
    } else if (isRecord(parsed) && Array.isArray(parsed.children) && !parsed.url) {
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

function countItems(node: BookmarkTreeNode): number {
  return 1 + (node.children ?? []).reduce((total, child) => total + countItems(child), 0);
}

/**
 * Create bookmarks from a parsed structure. Every item is attempted; failures are counted
 * (a failed folder counts its whole subtree) rather than reported as success.
 */
export async function importBookmarks(
  nodes: BookmarkTreeNode[],
  targetFolderId: string,
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { bookmarksCreated: 0, foldersCreated: 0, failed: 0, errors: [] };

  const createNode = async (node: BookmarkTreeNode, parentId: string): Promise<void> => {
    try {
      if (node.url) {
        await createBookmark({ parentId, title: node.title, url: node.url });
        outcome.bookmarksCreated += 1;
        return;
      }
      const folder = await createBookmark({ parentId, title: node.title });
      outcome.foldersCreated += 1;
      for (const child of node.children ?? []) {
        await createNode(child, folder.id);
      }
    } catch (err) {
      outcome.failed += node.url ? 1 : countItems(node);
      outcome.errors.push(err instanceof Error ? err.message : t('error_unknown'));
    }
  };

  for (const node of nodes) {
    await createNode(node, targetFolderId);
  }

  return outcome;
}

/**
 * Read file and parse bookmarks
 */
export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
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
