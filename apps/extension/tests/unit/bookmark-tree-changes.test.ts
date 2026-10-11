import { describe, expect, it, vi } from 'vitest';
import { findNode } from '@/lib/bookmark-tree';
import {
  applyBookmarkTreeChanges,
  type BookmarkEventBatch,
  type BookmarkTreeChange,
  type BrowserBookmarkNode,
  createBookmarkTreeSync,
  toBookmarkTreeNode,
} from '@/lib/bookmark-tree-changes';
import type { BookmarkTreeNode } from '@/types';

type ModelNode = {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  children?: ModelNode[];
};

/** An in-memory browser: each operation changes the tree and returns the event it would fire. */
function createBrowserModel() {
  let nextId = 100;
  const nodes = new Map<string, ModelNode>();
  const add = (node: ModelNode) => {
    nodes.set(node.id, node);
    for (const child of node.children ?? []) add(child);
  };
  add({
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bar',
        children: [
          {
            id: '10',
            parentId: '1',
            title: 'News',
            children: [
              { id: '11', parentId: '10', title: 'A', url: 'https://a.example/' },
              { id: '12', parentId: '10', title: 'B', url: 'https://b.example/' },
            ],
          },
          { id: '13', parentId: '1', title: 'C', url: 'https://c.example/' },
        ],
      },
      {
        id: '2',
        parentId: '0',
        title: 'Other',
        children: [{ id: '20', parentId: '2', title: 'Archive', children: [] }],
      },
    ],
  });
  const get = (id: string) => nodes.get(id) ?? expect.fail(`no node ${id}`);
  const toApi = (node: ModelNode, withChildren = true): BrowserBookmarkNode => {
    const parent = node.parentId ? get(node.parentId) : undefined;
    return {
      id: node.id,
      parentId: node.parentId,
      index: parent?.children?.indexOf(node),
      title: node.title,
      ...(node.url ? { url: node.url } : {}),
      ...(withChildren && node.children
        ? { children: node.children.map((child) => toApi(child)) }
        : {}),
      syncing: false,
    };
  };
  const detach = (node: ModelNode) => {
    const siblings = get(node.parentId ?? '').children ?? [];
    siblings.splice(siblings.indexOf(node), 1);
  };
  return {
    getTree: () => [toBookmarkTreeNode(toApi(get('0')))],
    create(parentId: string, index: number, title: string, url?: string): BookmarkTreeChange {
      const node: ModelNode = {
        id: String(nextId++),
        parentId,
        title,
        ...(url ? { url } : { children: [] }),
      };
      get(parentId).children?.splice(index, 0, node);
      nodes.set(node.id, node);
      // Chrome's event node for a new folder has no children array.
      return { type: 'created', node: toApi(node, false) };
    },
    remove(id: string): BookmarkTreeChange {
      const node = get(id);
      detach(node);
      return { type: 'removed', id, parentId: node.parentId ?? '' };
    },
    rename(id: string, title: string): BookmarkTreeChange {
      get(id).title = title;
      return { type: 'changed', id, title };
    },
    move(id: string, parentId: string, index: number): BookmarkTreeChange {
      const node = get(id);
      detach(node);
      node.parentId = parentId;
      get(parentId).children?.splice(index, 0, node);
      return { type: 'moved', id, parentId, index };
    },
    reorder(parentId: string, childIds: string[]): BookmarkTreeChange {
      const parent = get(parentId);
      parent.children = childIds.map(get);
      return { type: 'reordered', id: parentId, childIds };
    },
  };
}

const node = (tree: readonly BookmarkTreeNode[], id: string) =>
  findNode(tree, id) ?? expect.fail(`no node ${id}`);

describe('applyBookmarkTreeChanges', () => {
  it('ends with the tree the browser reports after each kind of event', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const changes = [
      browser.create('10', 0, 'New page', 'https://new.example/'),
      browser.create('2', 1, 'New folder'),
      browser.rename('10', 'Headlines'),
      browser.move('12', '20', 0),
      browser.move('11', '10', 0),
      browser.reorder('1', ['13', '10']),
      browser.remove('13'),
    ];

    expect(applyBookmarkTreeChanges(before, changes)).toEqual(browser.getTree());
  });

  it('moves within a folder to the final index the event reports', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const changes = [browser.move('11', '10', 1)];

    expect(applyBookmarkTreeChanges(before, changes)).toEqual(browser.getTree());
  });

  it('keeps every unchanged subtree as the same object', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const after = applyBookmarkTreeChanges(before, [
      browser.create('20', 0, 'Saved', 'https://saved.example/'),
    ]);
    if (!after) expect.fail('the change applies');

    expect(after).not.toBe(before);
    // The path to the change is new: the root, Other, and Archive.
    for (const id of ['0', '2', '20']) expect(node(after, id)).not.toBe(node(before, id));
    // Everything else is shared, children included.
    for (const id of ['1', '10', '11', '12', '13']) expect(node(after, id)).toBe(node(before, id));
  });

  it('removes a folder with everything inside it', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const after = applyBookmarkTreeChanges(before, [browser.remove('10')]);
    if (!after) expect.fail('the change applies');

    expect(after).toEqual(browser.getTree());
    expect(findNode(after, '11')).toBeUndefined();
    // Later events for a removed child do not match the tree, which then needs a reload.
    expect(applyBookmarkTreeChanges(after, [{ type: 'changed', id: '11', title: 'x' }])).toBeNull();
  });

  it('returns the same tree when it already reflects the changes', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const changes = [
      browser.create('10', 2, 'Late', 'https://late.example/'),
      browser.rename('11', 'Renamed'),
      browser.move('12', '20', 0),
      browser.reorder('1', ['13', '10']),
    ];
    // A reload that already saw the changes, then the batch of their events.
    const reloaded = browser.getTree();
    expect(applyBookmarkTreeChanges(reloaded, changes)).toBe(reloaded);

    const removal = [browser.remove('13')];
    const afterRemoval = browser.getTree();
    expect(applyBookmarkTreeChanges(afterRemoval, removal)).toBe(afterRemoval);
    expect(applyBookmarkTreeChanges(before, [])).toBe(before);
  });

  it('updates folder modified dates without other changes', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const after = applyBookmarkTreeChanges(before, [
      { type: 'changed', id: '20', dateGroupModified: 1_700_000_000_000 },
    ]);
    if (!after) expect.fail('the change applies');

    expect(node(after, '20').dateGroupModified).toBe(1_700_000_000_000);
    expect(node(after, '20').title).toBe('Archive');
    expect(node(after, '1')).toBe(node(before, '1'));
  });

  it.each<[string, BookmarkTreeChange]>([
    [
      'a node created in an unknown folder',
      {
        type: 'created',
        node: { id: '500', parentId: '404', index: 0, title: 'x', syncing: false },
      },
    ],
    [
      'an index past the end of the folder',
      {
        type: 'created',
        node: { id: '500', parentId: '20', index: 5, title: 'x', syncing: false },
      },
    ],
    ['a move into an unknown folder', { type: 'moved', id: '11', parentId: '404', index: 0 }],
    ['a folder moved into itself', { type: 'moved', id: '1', parentId: '10', index: 0 }],
    ['a move of an unknown node', { type: 'moved', id: '404', parentId: '20', index: 0 }],
    ['a removal from another parent', { type: 'removed', id: '11', parentId: '20' }],
    ['a reorder that misses a child', { type: 'reordered', id: '10', childIds: ['11'] }],
    ['a reorder with a foreign child', { type: 'reordered', id: '10', childIds: ['11', '13'] }],
  ])('asks for a reload for %s', (_name, change) => {
    const before = createBrowserModel().getTree();
    expect(applyBookmarkTreeChanges(before, [change])).toBeNull();
  });

  it('does not change the tree it was given', () => {
    const browser = createBrowserModel();
    const before = browser.getTree();
    const snapshot = structuredClone(before);
    applyBookmarkTreeChanges(before, [
      browser.create('10', 0, 'New', 'https://new.example/'),
      browser.move('13', '20', 0),
      browser.remove('11'),
    ]);

    expect(before).toEqual(snapshot);
  });

  it('treats Firefox separators as leaves and Firefox folders as folders', () => {
    const before = createBrowserModel().getTree();
    const after = applyBookmarkTreeChanges(before, [
      {
        type: 'created',
        node: {
          id: 's1',
          parentId: '20',
          index: 0,
          title: '',
          url: 'data:',
          type: 'separator',
          syncing: false,
        },
      },
      {
        type: 'created',
        node: {
          id: 'f1',
          parentId: '20',
          index: 1,
          title: 'Folder',
          type: 'folder',
          syncing: false,
        },
      },
    ]);
    if (!after) expect.fail('the change applies');

    expect(node(after, 's1').children).toBeUndefined();
    expect(node(after, 'f1').children).toEqual([]);
  });
});

describe('createBookmarkTreeSync', () => {
  function setup() {
    const browser = createBrowserModel();
    let tree: readonly BookmarkTreeNode[] | undefined;
    const reload = vi.fn(async () => {
      tree = browser.getTree();
    });
    const setTree = vi.fn((next: readonly BookmarkTreeNode[]) => {
      tree = next;
    });
    const sync = createBookmarkTreeSync({ getTree: () => tree, setTree, reload });
    return { browser, sync, reload, setTree, tree: () => tree };
  }
  const batch = (changes: BookmarkTreeChange[], reload = false): BookmarkEventBatch => ({
    changes,
    reload,
  });

  it('patches a loaded tree and reloads only when it has to', async () => {
    const { browser, sync, reload, setTree, tree } = setup();
    await sync.reload();
    await sync.applyBatch(batch([browser.create('20', 0, 'Saved', 'https://saved.example/')]));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(setTree).toHaveBeenCalledTimes(1);
    expect(tree()).toEqual(browser.getTree());

    await sync.applyBatch(batch([], true));
    expect(reload).toHaveBeenCalledTimes(2);
    await sync.applyBatch(batch([{ type: 'changed', id: '404', title: 'x' }]));
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it('applies a batch after a reload still in flight, never under it', async () => {
    const { browser, sync, reload, setTree, tree } = setup();
    let finishLoad = () => {};
    reload.mockImplementationOnce(async () => {
      // Read before the change below, and delivered after its event.
      const snapshot = browser.getTree();
      await new Promise<void>((resolve) => {
        finishLoad = resolve;
      });
      setTree(snapshot);
    });
    const loading = sync.reload();
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    const patching = sync.applyBatch(batch([browser.rename('11', 'Renamed')]));
    finishLoad();
    await Promise.all([loading, patching]);

    // The patch landed on the loaded tree instead of being overwritten by it.
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tree()).toEqual(browser.getTree());
  });

  it('reloads for a batch that arrives before the first load', async () => {
    const { browser, sync, reload, tree } = setup();
    await sync.applyBatch(batch([browser.rename('11', 'Early')]));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(node(tree() ?? [], '11').title).toBe('Early');
  });
});
