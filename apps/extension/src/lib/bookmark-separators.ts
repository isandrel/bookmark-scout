/**
 * Firefox bookmark separators. Firefox reports them with `type: 'separator'` and the URL `data:`
 * (no title, no children), so anything that only looks at the URL takes them for bookmarks.
 * Chrome and Edge have no separators: an import leaves them out there, and says so.
 */

/** Whether `node` is a separator, as the browser or the pages' tree reports it. */
export function isSeparatorNode(node: { type?: string }): boolean {
  return node.type === 'separator';
}

/** Whether this browser can store separators. Read at call time, so tests can set the browser. */
export function browserHasSeparators(): boolean {
  return import.meta.env.BROWSER === 'firefox';
}
