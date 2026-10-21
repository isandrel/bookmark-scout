/**
 * Every media type the extension names (clipboard and drag data, downloads, fetched pages and
 * icons), once, so a type is spelled one way and found in one place; `tests/unit/mime-types.test.ts`
 * fails on a media type written anywhere else in the source. These are protocol names, not
 * settings, so they stay in code.
 */
export const MIME = {
  plainText: 'text/plain',
  html: 'text/html',
  htmlUtf8: 'text/html; charset=UTF-8',
  xhtml: 'application/xhtml+xml',
  uriList: 'text/uri-list',
  /** Firefox's own drag type for a link: the URL, a newline, and its title. */
  mozUrl: 'text/x-moz-url',
  json: 'application/json',
  xml: 'application/xml',
  textXml: 'text/xml',
  markdown: 'text/markdown',
  csvUtf8: 'text/csv;charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  icon: 'image/x-icon',
  microsoftIcon: 'image/vnd.microsoft.icon',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  /** The manager's own drag data: the ids of the dragged bookmarks, between its own pages. */
  bookmarkIds: 'application/x-bookmark-scout-ids',
} as const;
