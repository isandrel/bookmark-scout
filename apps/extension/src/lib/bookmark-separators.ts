/**
 * Firefox bookmark separators. Firefox reports them with `type: 'separator'` and the URL `data:`
 * (no title, no children), so anything that only looks at the URL takes them for bookmarks.
 * Which browsers have them is `separators` in `lib/browser-profiles.ts`; elsewhere an import leaves
 * them out, and says so.
 */

/** Whether `node` is a separator, as the browser or the pages' tree reports it. */
export function isSeparatorNode(node: { type?: string }): boolean {
  return node.type === 'separator';
}
