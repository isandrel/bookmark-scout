/**
 * Bookmark Export Service
 * Extensible export with strategy pattern for multiple formats.
 * Uses config-driven settings and i18n for all user-facing text.
 */

import type { BookmarkTreeNode } from '@/types';
import { t } from '@/hooks/use-i18n';
import { defaultSettings } from '@/lib/settings-schema';

// ============================================================================
// Export Format Interface (Strategy Pattern)
// ============================================================================

export interface ExportOptions {
  /** Include bookmark URLs (default: from settings) */
  includeUrls?: boolean;
  /** Include dates (default: from settings) */
  includeDates?: boolean;
  /** Indentation size for formatted output (default: from settings) */
  indentSize?: number;
}

export interface ExportFormat {
  /** i18n key for format name */
  nameKey: string;
  /** File extension (without dot) */
  extension: string;
  /** MIME type for download */
  mimeType: string;
  /** Serialize bookmarks to string */
  serialize(bookmarks: BookmarkTreeNode, options?: ExportOptions): string;
}

// ============================================================================
// Built-in Format Strategies
// ============================================================================

/**
 * Chrome/Netscape HTML format - compatible with browser import
 */
export const htmlFormat: ExportFormat = {
  nameKey: 'export_formatHtml',
  extension: 'html',
  mimeType: 'text/html',
  serialize(node: BookmarkTreeNode, options?: ExportOptions): string {
    const includeDates = options?.includeDates ?? defaultSettings.exportIncludeDates;
    const indentSpaces = defaultSettings.exportHtmlIndentSpaces;
    const indent = ' '.repeat(indentSpaces);

    const escapeHtml = (text: string): string =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const renderNode = (n: BookmarkTreeNode, depth: number): string => {
      const nodeIndent = indent.repeat(depth);

      if (n.url) {
        // Bookmark
        const dateAttr = includeDates && n.dateAdded ? ` ADD_DATE="${Math.floor(n.dateAdded / 1000)}"` : '';
        return `${nodeIndent}<DT><A HREF="${escapeHtml(n.url)}"${dateAttr}>${escapeHtml(n.title)}</A>\n`;
      }

      // Folder
      const dateAttr = includeDates && n.dateGroupModified 
        ? ` ADD_DATE="${Math.floor(n.dateGroupModified / 1000)}"` 
        : '';
      const children = n.children?.map((c) => renderNode(c, depth + 1)).join('') ?? '';
      
      return `${nodeIndent}<DT><H3${dateAttr}>${escapeHtml(n.title)}</H3>\n${nodeIndent}<DL><p>\n${children}${nodeIndent}</DL><p>\n`;
    };

    const content = node.children?.map((c) => renderNode(c, 1)).join('') ?? renderNode(node, 1);
    const htmlTitle = t('export_htmlTitle') || 'Bookmarks';

    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>${htmlTitle}</TITLE>
<H1>${htmlTitle}</H1>
<DL><p>
${content}</DL><p>
`;
  },
};

/**
 * JSON format - preserves all data, easy to process programmatically
 */
export const jsonFormat: ExportFormat = {
  nameKey: 'export_formatJson',
  extension: 'json',
  mimeType: 'application/json',
  serialize(node: BookmarkTreeNode, options?: ExportOptions): string {
    const indentSize = options?.indentSize ?? defaultSettings.exportJsonIndentSize;
    const includeDates = options?.includeDates ?? defaultSettings.exportIncludeDates;

    const cleanNode = (n: BookmarkTreeNode): Record<string, unknown> => {
      const result: Record<string, unknown> = {
        title: n.title,
      };

      if (n.url) {
        result.url = n.url;
      }

      if (includeDates) {
        if (n.dateAdded) result.dateAdded = n.dateAdded;
        if (n.dateGroupModified) result.dateGroupModified = n.dateGroupModified;
      }

      if (n.children && n.children.length > 0) {
        result.children = n.children.map(cleanNode);
      }

      return result;
    };

    return JSON.stringify(cleanNode(node), null, indentSize);
  },
};

/**
 * Markdown format - human-readable hierarchical list
 */
export const markdownFormat: ExportFormat = {
  nameKey: 'export_formatMarkdown',
  extension: 'md',
  mimeType: 'text/markdown',
  serialize(node: BookmarkTreeNode, options?: ExportOptions): string {
    const includeUrls = options?.includeUrls ?? defaultSettings.exportIncludeUrls;
    const indentSpaces = defaultSettings.exportMarkdownIndentSpaces;
    const indent = ' '.repeat(indentSpaces);

    const renderNode = (n: BookmarkTreeNode, depth: number): string => {
      const nodeIndent = indent.repeat(depth);

      if (n.url) {
        // Bookmark as link
        return includeUrls
          ? `${nodeIndent}- [${n.title}](${n.url})\n`
          : `${nodeIndent}- ${n.title}\n`;
      }

      // Folder
      const header = depth === 0 ? `# ${n.title}\n\n` : `${nodeIndent}- **${n.title}**\n`;
      const children = n.children?.map((c) => renderNode(c, depth + 1)).join('') ?? '';
      return header + children;
    };

    return renderNode(node, 0);
  },
};

/**
 * CSV format - flat table, useful for spreadsheets
 */
export const csvFormat: ExportFormat = {
  nameKey: 'export_formatCsv',
  extension: 'csv',
  mimeType: 'text/csv',
  serialize(node: BookmarkTreeNode, options?: ExportOptions): string {
    const includeDates = options?.includeDates ?? defaultSettings.exportIncludeDates;
    const rows: string[][] = [];

    const escapeCsv = (text: string): string => {
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const collectRows = (n: BookmarkTreeNode, path: string): void => {
      const currentPath = path ? `${path}/${n.title}` : n.title;

      if (n.url) {
        const row = [escapeCsv(n.title), escapeCsv(n.url), escapeCsv(path)];
        if (includeDates && n.dateAdded) {
          row.push(new Date(n.dateAdded).toISOString());
        }
        rows.push(row);
      }

      n.children?.forEach((c) => {
        collectRows(c, currentPath);
      });
    };

    // Header - use i18n keys
    const header = includeDates
      ? [
          t('export_csvTitle') || 'Title',
          t('export_csvUrl') || 'URL',
          t('export_csvFolder') || 'Folder',
          t('export_csvDateAdded') || 'Date Added',
        ]
      : [
          t('export_csvTitle') || 'Title',
          t('export_csvUrl') || 'URL',
          t('export_csvFolder') || 'Folder',
        ];
    rows.push(header);

    // Collect all bookmarks
    collectRows(node, '');

    return rows.map((row) => row.join(',')).join('\n');
  },
};

// ============================================================================
// Format Registry
// ============================================================================

export const exportFormats: Record<string, ExportFormat> = {
  html: htmlFormat,
  json: jsonFormat,
  markdown: markdownFormat,
  csv: csvFormat,
};

/**
 * Get format display name using i18n
 */
export function getFormatName(format: ExportFormat): string {
  return t(format.nameKey as Parameters<typeof t>[0]) || format.nameKey;
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Get a subtree from a bookmark tree by folder ID
 */
export function getSubtree(
  root: BookmarkTreeNode,
  folderId: string
): BookmarkTreeNode | null {
  if (root.id === folderId) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = getSubtree(child, folderId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Export bookmarks to a string in the specified format
 */
export function exportBookmarks(
  node: BookmarkTreeNode,
  format: ExportFormat,
  options?: ExportOptions
): string {
  return format.serialize(node, options);
}

/**
 * Trigger a file download in the browser
 */
export function downloadExport(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename for export using config settings
 */
export function generateFilename(
  folderName: string,
  format: ExportFormat
): string {
  const prefix = defaultSettings.exportFilenamePrefix;
  const maxLength = defaultSettings.exportFilenameMaxLength;
  
  const sanitized = folderName
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, maxLength);
  const date = new Date().toISOString().split('T')[0];
  return `${prefix}${sanitized}_${date}.${format.extension}`;
}
