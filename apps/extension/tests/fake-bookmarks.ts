/**
 * An in-memory bookmark tree behind `fakeBrowser.bookmarks`, which WXT's fake browser does not
 * implement. Tests seed it, run the real services, and read the tree back.
 */
import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type Node = Browser.bookmarks.BookmarkTreeNode;

export type FakeBookmarkSeed = {
  id: string;
  /** Defaults to the root folder `0`. */
  parentId?: string;
  title: string;
  /** Leave out for a folder. */
  url?: string;
};

export type FakeBookmarks = {
  /** The node with its index and subtree, or undefined once removed. */
  get(id: string): Node | undefined;
  /** Ids of the folder's children, in order. */
  childIds(id: string): string[];
  /** Calls that fail with an error, by method and id. */
  fail: Record<'update' | 'remove' | 'create', Set<string>>;
  /** `<method> <id>` for every write, in order. */
  writes: string[];
};

export const FAKE_ROOT_ID = '0';

export function installFakeBookmarks(seed: FakeBookmarkSeed[]): FakeBookmarks {
  type Stored = { id: string; parentId?: string; title: string; url?: string; children?: string[] };
  const nodes = new Map<string, Stored>([[FAKE_ROOT_ID, { id: FAKE_ROOT_ID, title: '', children: [] }]]);
  let nextId = 1000;
  const fail = { update: new Set<string>(), remove: new Set<string>(), create: new Set<string>() };
  const writes: string[] = [];

  const need = (id: string) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Can't find bookmark for id ${id}.`);
    return node;
  };
  const toNode = (stored: Stored): Node => {
    const parent = stored.parentId ? nodes.get(stored.parentId) : undefined;
    const index = parent?.children?.indexOf(stored.id);
    return {
      id: stored.id,
      title: stored.title,
      syncing: false,
      ...(stored.parentId ? { parentId: stored.parentId } : {}),
      ...(stored.url ? { url: stored.url } : {}),
      ...(index !== undefined && index >= 0 ? { index } : {}),
      ...(stored.children ? { children: stored.children.map((child) => toNode(need(child))) } : {}),
    } as Node;
  };
  const add = (details: { parentId?: string; index?: number; title?: string; url?: string }, id = String(nextId++)) => {
    const parentId = details.parentId ?? FAKE_ROOT_ID;
    const parent = need(parentId);
    if (!parent.children) throw new Error('Parent is not a folder.');
    const index = details.index ?? parent.children.length;
    if (index > parent.children.length) throw new Error('Index out of bounds.');
    nodes.set(id, {
      id,
      parentId,
      title: details.title ?? '',
      ...(details.url ? { url: details.url } : { children: [] }),
    });
    parent.children.splice(index, 0, id);
    return need(id);
  };
  const remove = (id: string) => {
    const node = need(id);
    for (const child of [...(node.children ?? [])]) remove(child);
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    parent?.children?.splice(parent.children.indexOf(id), 1);
    nodes.delete(id);
  };

  for (const item of seed) add(item, item.id);

  const api = fakeBrowser.bookmarks;
  vi.spyOn(api, 'getTree').mockImplementation(async () => [toNode(need(FAKE_ROOT_ID))]);
  vi.spyOn(api, 'getSubTree').mockImplementation(async (id: string) => [toNode(need(id))]);
  vi.spyOn(api, 'get').mockImplementation((async (id: string) => {
    const { children: _children, ...node } = toNode(need(id));
    return [node];
  }) as typeof api.get);
  vi.spyOn(api, 'getChildren').mockImplementation(async (id: string) =>
    (need(id).children ?? []).map((child) => {
      const { children: _children, ...node } = toNode(need(child));
      return node as Node;
    }),
  );
  vi.spyOn(api, 'create').mockImplementation(async (details) => {
    if (fail.create.has(details.title ?? '')) throw new Error(`create failed: ${details.title}`);
    const created = add(details);
    writes.push(`create ${created.id}`);
    return toNode(created);
  });
  vi.spyOn(api, 'update').mockImplementation(async (id, changes) => {
    if (fail.update.has(id)) throw new Error('update failed');
    const node = need(id);
    if (changes.title !== undefined) node.title = changes.title;
    if (changes.url !== undefined) node.url = changes.url;
    writes.push(`update ${id}`);
    return toNode(node);
  });
  vi.spyOn(api, 'removeTree').mockImplementation(async (id: string) => {
    if (fail.remove.has(id)) throw new Error('remove failed');
    remove(id);
    writes.push(`remove ${id}`);
  });
  vi.spyOn(api, 'remove').mockImplementation(async (id: string) => {
    if (fail.remove.has(id)) throw new Error('remove failed');
    remove(id);
    writes.push(`remove ${id}`);
  });

  return {
    get: (id) => {
      const node = nodes.get(id);
      return node ? toNode(node) : undefined;
    },
    childIds: (id) => [...(nodes.get(id)?.children ?? [])],
    fail,
    writes,
  };
}
