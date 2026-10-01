/**
 * Bookmark Export Service
 * Extensible export with strategy pattern for multiple formats.
 * Uses config-driven settings and i18n for all user-facing text.
 */

import type { BookmarkTreeNode } from '@/types';

// ============================================================================
// Export Format Interface (Strategy Pattern)
// ============================================================================

export interface ExportOptions {
  /** Include bookmark URLs in Markdown and CSV (HTML and JSON always keep them for re-import). */
  includeUrls?: boolean;
  /** Include dates (HTML ADD_DATE, JSON dates, CSV column) */
  includeDates?: boolean;
  /** JSON indentation size */
  jsonIndentSize?: number;
  /** HTML indentation size */
  htmlIndentSpaces?: number;
  /** Markdown list indentation size */
  markdownIndentSpaces?: number;
}

export interface ExportFormat {
  /** i18n key for format name */
  nameKey: string;
  /** File extension (without dot) */
  extension: string;
  /** MIME type for download */
  mimeType: string;
  /** True when the `includeUrls` option can leave URLs out of this format. */
  urlsOptional?: boolean;
  /**
   * Serialize bookmarks. `root` is a container: its children are the exported top-level
   * entries and its own title is not written as a folder.
   */
  serialize(root: BookmarkTreeNode, options?: ExportOptions): string;
}

// ============================================================================
// Built-in Format Strategies
// ============================================================================

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Chrome/Netscape HTML format - compatible with browser import
 */
export const htmlFormat: ExportFormat = {
  nameKey: 'export_formatHtml',
  extension: 'html',
  mimeType: 'text/html',
  serialize(root: BookmarkTreeNode, options?: ExportOptions): string {
    const includeDates = options?.includeDates ?? defaultSettings.exportIncludeDates;
    const indent = ' '.repeat(options?.htmlIndentSpaces ?? defaultSettings.exportHtmlIndentSpaces);

    const renderNode = (n: BookmarkTreeNode, depth: number): string => {
      const nodeIndent = indent.repeat(depth);

      if (n.url) {
        const dateAttr =
          includeDates && n.dateAdded ? ` ADD_DATE="${Math.floor(n.dateAdded / 1000)}"` : '';
        return `${nodeIndent}<DT><A HREF="${escapeHtml(n.url)}"${dateAttr}>${escapeHtml(n.title)}</A>\n`;
      }

      const dateAttr =
        includeDates && n.dateGroupModified
          ? ` ADD_DATE="${Math.floor(n.dateGroupModified / 1000)}"`
          : '';
      const children = n.children?.map((c) => renderNode(c, depth + 1)).join('') ?? '';
      return `${nodeIndent}<DT><H3${dateAttr}>${escapeHtml(n.title)}</H3>\n${nodeIndent}<DL><p>\n${children}${nodeIndent}</DL><p>\n`;
    };

    const content = root.children?.map((c) => renderNode(c, 1)).join('') ?? '';
    const htmlTitle = escapeHtml(t('export_htmlTitle') || 'Bookmarks');

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
  serialize(root: BookmarkTreeNode, options?: ExportOptions): string {
    const indentSize = options?.jsonIndentSize ?? defaultSettings.exportJsonIndentSize;
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

    // The container keeps a title for readability; importers take its children as top level.
    return JSON.stringify(
      { title: root.title, children: (root.children ?? []).map(cleanNode) },
      null,
      indentSize,
    );
  },
};

/** Escapes Markdown syntax and raw HTML so titles render as plain text. */
export function escapeMarkdownText(text: string): string {
  return text
    .replace(/[\\`*_[\]]/g, (char) => `\\${char}`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escapes block syntax a title would otherwise trigger at the start of a list item's text:
 * headings (`#`), ordered (`1.`, `1)`) and nested (`-`, `+`) lists, thematic breaks and setext
 * underlines (`---`, `===`), code fences (`~~~`), and block quotes. Apply after
 * {@link escapeMarkdownText}, which already covers `*`, `_`, backticks, and `>`.
 */
export function escapeMarkdownLineStart(text: string): string {
  return text
    .replace(/^(\s*)(\d+)([.)])/, '$1$2\\$3')
    .replace(/^(\s*)([#+\-=~])/, '$1\\$2');
}

/** Percent-encodes characters that would end or break a Markdown link destination. */
function escapeMarkdownUrl(url: string): string {
  return url.replace(
    /[\s()<>]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/**
 * Markdown format - human-readable hierarchical list
 */
export const markdownFormat: ExportFormat = {
  nameKey: 'export_formatMarkdown',
  extension: 'md',
  mimeType: 'text/markdown',
  urlsOptional: true,
  serialize(root: BookmarkTreeNode, options?: ExportOptions): string {
    const includeUrls = options?.includeUrls ?? defaultSettings.exportIncludeUrls;
    const indent = ' '.repeat(
      options?.markdownIndentSpaces ?? defaultSettings.exportMarkdownIndentSpaces,
    );

    const renderNode = (n: BookmarkTreeNode, depth: number): string => {
      const nodeIndent = indent.repeat(depth);
      const title = escapeMarkdownText(n.title);

      if (n.url) {
        return includeUrls
          ? `${nodeIndent}- [${title}](${escapeMarkdownUrl(n.url)})\n`
          : `${nodeIndent}- ${escapeMarkdownLineStart(title)}\n`;
      }

      const children = n.children?.map((c) => renderNode(c, depth + 1)).join('') ?? '';
      return `${nodeIndent}- **${title}**\n${children}`;
    };

    const heading = `# ${escapeMarkdownText(root.title)}\n\n`;
    return heading + (root.children?.map((c) => renderNode(c, 0)).join('') ?? '');
  },
};

/** Neutralizes spreadsheet formulas (CSV injection) and applies RFC 4180 quoting. */
export function escapeCsvCell(text: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

/**
 * Escapes a folder name for the CSV folder path, whose segments are joined with `/`:
 * a literal `/` is written as `\/` and a backslash as `\\`.
 */
export function escapeCsvPathSegment(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/\//g, '\\/');
}

/** Lets spreadsheet apps such as Excel detect UTF-8 instead of a legacy code page. */
const UTF8_BOM = '﻿';

/**
 * CSV format - flat table, useful for spreadsheets
 */
export const csvFormat: ExportFormat = {
  nameKey: 'export_formatCsv',
  extension: 'csv',
  mimeType: 'text/csv;charset=utf-8',
  urlsOptional: true,
  serialize(root: BookmarkTreeNode, options?: ExportOptions): string {
    const includeDates = options?.includeDates ?? defaultSettings.exportIncludeDates;
    const includeUrls = options?.includeUrls ?? defaultSettings.exportIncludeUrls;
    const rows: string[][] = [
      [
        t('export_csvTitle') || 'Title',
        ...(includeUrls ? [t('export_csvUrl') || 'URL'] : []),
        t('export_csvFolder') || 'Folder',
        ...(includeDates ? [t('export_csvDateAdded') || 'Date Added'] : []),
      ],
    ];

    const collectRows = (n: BookmarkTreeNode, path: string): void => {
      if (n.url) {
        rows.push([
          n.title,
          ...(includeUrls ? [n.url] : []),
          path,
          ...(includeDates ? [n.dateAdded ? new Date(n.dateAdded).toISOString() : ''] : []),
        ]);
        return;
      }
      const segment = escapeCsvPathSegment(n.title);
      const folderPath = path ? `${path}/${segment}` : segment;
      n.children?.forEach((c) => {
        collectRows(c, folderPath);
      });
    };

    root.children?.forEach((child) => {
      collectRows(child, '');
    });

    return UTF8_BOM + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
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
 * Builds the export container for a scope. The browser's unnamed root is unwrapped so its
 * children (Bookmarks Bar, Other Bookmarks) become top-level entries instead of sitting under
 * a nameless folder that re-imports as "Untitled Folder".
 */
export function buildExportRoot(scopeNodes: BookmarkTreeNode[]): BookmarkTreeNode {
  const children = scopeNodes.flatMap((node) =>
    !node.url && !node.parentId && !node.title ? (node.children ?? []) : [node],
  );
  return { id: 'export-root', title: t('export_htmlTitle') || 'Bookmarks', children };
}

/** Whether an export in `format` writes bookmark URLs, given the `includeUrls` setting. */
export function exportIncludesUrls(format: ExportFormat, includeUrls: boolean): boolean {
  return includeUrls || !format.urlsOptional;
}

export function countExportedBookmarks(root: BookmarkTreeNode): number {
  return (root.children ?? []).reduce(
    (total, node) => total + (node.url ? 1 : countExportedBookmarks(node)),
    0,
  );
}

/**
 * Generate a filename for export: `<prefix><scope>_<local YYYY-MM-DD>.<ext>`
 */
export function generateFilename(
  folderName: string,
  format: ExportFormat,
  options: { prefix?: string; maxLength?: number; now?: Date } = {},
): string {
  const prefix = options.prefix ?? defaultSettings.exportFilenamePrefix;
  const maxLength = options.maxLength ?? defaultSettings.exportFilenameMaxLength;
  const now = options.now ?? new Date();

  // Only characters that filesystems reject are replaced, so names such as "日本語" survive.
  const sanitized = Array.from(
    folderName
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\p{Cc}\s]/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^[._]+|[._]+$/g, ''),
  )
    .slice(0, maxLength)
    .join('');
  const safePrefix = prefix.replace(/[\\/:*?"<>|]/g, '_');
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${safePrefix}${sanitized}_${date}.${format.extension}`;
}
