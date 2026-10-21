/**
 * Firefox bookmark separators. Firefox reports them with `type: 'separator'` and the URL `data:`
 * (no title, no children), so anything that only looks at the URL takes them for bookmarks.
 * Which browsers have them is `separators` in `lib/browser-profiles.ts`; elsewhere an import leaves
 * them out, and says so.
 */

/** The `type` Firefox gives a separator, and the one exports write and imports read. */
export const SEPARATOR_TYPE = 'separator';

/** What a bookmark node is, as records and the baseline store it. */
export const BOOKMARK_NODE_KINDS = ['bookmark', 'folder', SEPARATOR_TYPE] as const;

export type BookmarkNodeKind = (typeof BOOKMARK_NODE_KINDS)[number];

/** Whether `node` is a separator, as the browser or the pages' tree reports it. */
export function isSeparatorNode(node: { type?: string }): boolean {
  return node.type === SEPARATOR_TYPE;
}

/** What `node` is: a separator, a bookmark (it has an address), or a folder. */
export function bookmarkNodeKind(node: { url?: string; type?: string }): BookmarkNodeKind {
  if (isSeparatorNode(node)) return SEPARATOR_TYPE;
  return node.url ? 'bookmark' : 'folder';
}
