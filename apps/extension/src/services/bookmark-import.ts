/**
 * Bookmark Import Service
 * Extensible import with strategy pattern for multiple formats.
 */

import type { BookmarkTreeNode } from '@/types';

// ============================================================================
// Import Format Interface (Strategy Pattern)
// ============================================================================

export interface ImportResult {
  /** Parsed bookmark tree */
  bookmarks: BookmarkTreeNode[];
  /** Number of bookmarks imported */
  bookmarkCount: number;
  /** Number of folders imported */
  folderCount: number;
}

export interface ImportFormat {
  /** Display name of the format */
  name: string;
  /** Supported file extensions (without dot) */
  extensions: string[];
  /** MIME types to accept */
  mimeTypes: string[];
  /** Parse content and return bookmark tree */
  parse(content: string): BookmarkTreeNode[];
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
  parse(content: string): BookmarkTreeNode[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const result: BookmarkTreeNode[] = [];

    let idCounter = 0;
    const generateId = () => `imported-${Date.now()}-${++idCounter}`;

    const parseNode = (element: Element, parentId?: string): BookmarkTreeNode | null => {
      // Handle <A> tags (bookmarks)
      if (element.tagName === 'A') {
        const url = element.getAttribute('HREF');
        const title = element.textContent?.trim() || 'Untitled';
        const dateAdded = element.getAttribute('ADD_DATE');

        return {
          id: generateId(),
          parentId,
          title,
          url: url || undefined,
          dateAdded: dateAdded ? parseInt(dateAdded, 10) * 1000 : Date.now(),
        };
      }

      // Handle <H3> tags (folders)
      if (element.tagName === 'H3') {
        const title = element.textContent?.trim() || 'Untitled Folder';
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

    return result;
  },
};

/**
 * JSON format parser
 */
export const jsonImportFormat: ImportFormat = {
  name: 'JSON',
  extensions: ['json'],
  mimeTypes: ['application/json'],
  parse(content: string): BookmarkTreeNode[] {
    let idCounter = 0;
    const generateId = () => `imported-${Date.now()}-${++idCounter}`;

    interface RawNode {
      title?: string;
      url?: string;
      dateAdded?: number;
      dateGroupModified?: number;
      children?: RawNode[];
    }

    const parseRawNode = (raw: RawNode, parentId?: string): BookmarkTreeNode => {
      const id = generateId();
      const node: BookmarkTreeNode = {
        id,
        parentId,
        title: raw.title || 'Untitled',
        url: raw.url,
        dateAdded: raw.dateAdded,
        dateGroupModified: raw.dateGroupModified,
      };

      if (raw.children && raw.children.length > 0) {
        node.children = raw.children.map((child) => parseRawNode(child, id));
      }

      return node;
    };

    try {
      const parsed = JSON.parse(content);
      
      // Handle both single object and array formats
      if (Array.isArray(parsed)) {
        return parsed.map((item) => parseRawNode(item, undefined));
      }
      
      // Single root object
      if (parsed.children && Array.isArray(parsed.children)) {
        return parsed.children.map((item: RawNode) => parseRawNode(item, undefined));
      }
      
      return [parseRawNode(parsed, undefined)];
    } catch {
      throw new Error('Invalid JSON format');
    }
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
  const bookmarks = format.parse(content);

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
    bookmarkCount,
    folderCount,
  };
}

/**
 * Create bookmarks in Chrome from parsed structure
 */
export async function importBookmarks(
  nodes: BookmarkTreeNode[],
  targetFolderId: string
): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  const createNode = async (
    node: BookmarkTreeNode,
    parentId: string
  ): Promise<void> => {
    try {
      if (node.url) {
        // Create bookmark
        await chrome.bookmarks.create({
          parentId,
          title: node.title,
          url: node.url,
        });
        created++;
      } else {
        // Create folder
        const folder = await chrome.bookmarks.create({
          parentId,
          title: node.title,
        });
        created++;

        // Recursively create children
        if (node.children) {
          for (const child of node.children) {
            await createNode(child, folder.id);
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to create "${node.title}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  for (const node of nodes) {
    await createNode(node, targetFolderId);
  }

  return { created, errors };
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
