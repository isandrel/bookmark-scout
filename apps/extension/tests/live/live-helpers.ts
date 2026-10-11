import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Worker } from '@playwright/test';
import { storageAreaKey } from '../../src/lib/storage/registry';
import { expect } from '../e2e/fixtures';
import { readStored, STORAGE_ITEMS, seedAIServices, setSettings } from '../e2e/storage';
import type { LiveAIConfig } from './live-env';

/** A real model answers in seconds, sometimes tens of seconds; nothing here is timed tightly. */
export const AI_TIMEOUT = 120_000;

type Article = { title: string; body: string };

/**
 * Every page the tests visit or bookmark, served by a local HTTP server so no external site is
 * reached. Synthetic text, written to make the right folder obvious to a model.
 */
export const ARTICLES = {
  'rust-ownership': {
    title: 'Rust ownership explained',
    body: 'How Rust moves values, what the borrow checker enforces, and why lifetimes exist.',
  },
  'rust-borrowing': {
    title: 'Borrowing and references in Rust',
    body: 'Shared and mutable references, and the rules the Rust compiler checks for them.',
  },
  'cargo-guide': {
    title: 'The Cargo guide',
    body: 'Creating Rust crates, adding dependencies, and running tests with cargo.',
  },
  'rust-async': {
    title: 'Asynchronous programming in Rust',
    body: 'Futures, async and await, and choosing an executor such as Tokio for Rust programs.',
  },
  'rust-lifetimes': {
    title: 'Understanding Rust lifetimes',
    body: 'Lifetime annotations in Rust functions and structs, with borrow checker examples.',
  },
  'typescript-generics': {
    title: 'TypeScript generics in depth',
    body: 'Generic functions, constraints, and inference in the TypeScript type system.',
  },
  'typescript-narrowing': {
    title: 'Type narrowing in TypeScript',
    body: 'typeof, instanceof, and discriminated unions to narrow types in TypeScript.',
  },
  'pasta-carbonara': {
    title: 'Classic pasta carbonara recipe',
    body: 'Spaghetti, eggs, pecorino, and guanciale: an Italian dinner recipe in 20 minutes.',
  },
  'sourdough-starter': {
    title: 'Making a sourdough starter',
    body: 'Flour, water, and a week of feeding: baking bread with a homemade starter.',
  },
  'banana-bread': {
    title: 'Easy banana bread recipe',
    body: 'Ripe bananas, butter, and flour: a simple baking recipe for a loaf cake.',
  },
  'kyoto-temples': {
    title: 'A walking guide to Kyoto temples',
    body: 'Travel tips for visiting Kyoto temples and gardens in Japan over three days.',
  },
  'lisbon-trip': {
    title: 'Three days in Lisbon',
    body: 'Travel itinerary for Lisbon, Portugal: neighborhoods, trams, and viewpoints.',
  },
} as const satisfies Record<string, Article>;

export type ArticleSlug = keyof typeof ARTICLES;

export type LocalSite = {
  url: (slug: ArticleSlug) => string;
  close: () => Promise<void>;
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Serves `ARTICLES` at `/articles/<slug>` on a free local port. */
export async function startLocalSite(): Promise<LocalSite> {
  const server: Server = createServer((request, response) => {
    const slug = decodeURIComponent(request.url?.split('/').pop() ?? '') as ArticleSlug;
    const article: Article | undefined = ARTICLES[slug];
    if (!article) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const title = escapeHtml(article.title);
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        `<!doctype html><html lang="en"><title>${title}</title><main><h1>${title}</h1>` +
          `<p>${escapeHtml(article.body)}</p></main></html>`,
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (slug) => `http://127.0.0.1:${port}/articles/${slug}`,
    // The browser keeps connections alive; drop them so close() cannot hang the hook.
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

type LibraryNode = { title: string; slug?: ArticleSlug; children?: LibraryNode[] };
/** A library node as the browser creates it. */
type SeedNode = { title: string; url?: string; children?: SeedNode[] };

/** A small library with clear topics, a mixed folder for the tools, and an inbox to sort. */
const LIBRARY: LibraryNode[] = [
  {
    title: 'Programming',
    children: [
      {
        title: 'Rust',
        children: [
          { title: ARTICLES['rust-ownership'].title, slug: 'rust-ownership' },
          { title: ARTICLES['rust-borrowing'].title, slug: 'rust-borrowing' },
          { title: ARTICLES['cargo-guide'].title, slug: 'cargo-guide' },
        ],
      },
      {
        title: 'TypeScript',
        children: [{ title: ARTICLES['typescript-generics'].title, slug: 'typescript-generics' }],
      },
    ],
  },
  {
    title: 'Cooking',
    children: [{ title: ARTICLES['sourdough-starter'].title, slug: 'sourdough-starter' }],
  },
  {
    title: 'Travel',
    children: [{ title: ARTICLES['lisbon-trip'].title, slug: 'lisbon-trip' }],
  },
  {
    title: 'Inbox',
    children: [{ title: ARTICLES['rust-async'].title, slug: 'rust-async' }],
  },
  {
    title: 'Unsorted',
    children: [
      { title: ARTICLES['pasta-carbonara'].title, slug: 'pasta-carbonara' },
      { title: ARTICLES['typescript-narrowing'].title, slug: 'typescript-narrowing' },
      { title: ARTICLES['kyoto-temples'].title, slug: 'kyoto-temples' },
      { title: ARTICLES['banana-bread'].title, slug: 'banana-bread' },
    ],
  },
];

export type SeededLibrary = {
  /** Folder ids by path below the bookmarks bar, such as `Programming/Rust`. */
  folders: Record<string, string>;
  /** Bookmark ids by title. */
  bookmarks: Record<string, string>;
};

/** Creates `LIBRARY` in the bookmarks bar, with every bookmark on the local site. */
export async function seedLibrary(worker: Worker, site: LocalSite): Promise<SeededLibrary> {
  const withUrls = (nodes: LibraryNode[]): SeedNode[] =>
    nodes.map((node) => ({
      title: node.title,
      ...(node.slug ? { url: site.url(node.slug) } : {}),
      ...(node.children ? { children: withUrls(node.children) } : {}),
    }));
  return worker.evaluate(async (nodes) => {
    const [root] = await chrome.bookmarks.getTree();
    const bar = root.children?.find((node) => node.children !== undefined);
    if (!bar) throw new Error('No writable bookmark root found');
    const library: { folders: Record<string, string>; bookmarks: Record<string, string> } = {
      folders: {},
      bookmarks: {},
    };
    const create = async (parentId: string, path: string, items: SeedNode[]) => {
      for (const item of items) {
        const node = await chrome.bookmarks.create({
          parentId,
          title: item.title,
          ...(item.url ? { url: item.url } : {}),
        });
        if (item.url) {
          library.bookmarks[item.title] = node.id;
          continue;
        }
        const folderPath = path ? `${path}/${item.title}` : item.title;
        library.folders[folderPath] = node.id;
        await create(node.id, folderPath, item.children ?? []);
      }
    };
    await create(bar.id, '', nodes);
    return library;
  }, withUrls(LIBRARY));
}

/**
 * Turns AI on and adds the live provider as the default service, as Options stores it, with the
 * activity log recording so each call can be checked.
 */
export async function configureLiveAI(
  worker: Worker,
  ai: LiveAIConfig,
  settings: Record<string, unknown> = {},
) {
  await setSettings(worker, {
    language: 'en',
    aiEnabled: true,
    aiActivityRecording: true,
    aiAutoTriggerOnOpen: false,
    ...settings,
  });
  await seedAIServices(worker, [
    {
      provider: ai.provider,
      name: 'Live AI',
      model: ai.model,
      credentials: { apiKey: ai.apiKey, baseUrl: ai.baseUrl },
    },
  ]);
}

export function parentOf(worker: Worker, id: string) {
  return worker.evaluate(async (bookmarkId) => {
    const [node] = await chrome.bookmarks.get(bookmarkId).catch(() => []);
    return node?.parentId;
  }, id);
}

export function childrenOf(worker: Worker, folderId: string) {
  return worker.evaluate(
    async (id) =>
      (await chrome.bookmarks.getChildren(id)).map(({ id: childId, title, url }) => ({
        id: childId,
        title,
        url,
      })),
    folderId,
  );
}

/**
 * The API key never leaves the credentials item: not into synced storage, the AI activity log,
 * the rest of local storage, or session storage. Compared inside the browser, so the key is never
 * printed, even when the check fails. Also checks the activity log recorded each `sources` call.
 */
export async function expectKeyKeptPrivate(
  worker: Worker,
  ai: LiveAIConfig,
  sources: readonly string[],
) {
  const found = await worker.evaluate(
    async ({ key, credentialsKey, activityKey }) => {
      const contains = (value: unknown) => JSON.stringify(value ?? null).includes(key);
      const local = await chrome.storage.local.get(null);
      const { [credentialsKey]: credentials, ...otherLocal } = local;
      return {
        credentials: contains(credentials),
        sync: contains(await chrome.storage.sync.get(null)),
        activity: contains(local[activityKey]),
        otherLocal: contains(otherLocal),
        session: contains(await chrome.storage.session.get(null)),
      };
    },
    {
      key: ai.apiKey,
      credentialsKey: storageAreaKey(STORAGE_ITEMS.aiCredentials),
      activityKey: storageAreaKey(STORAGE_ITEMS.aiActivity),
    },
  );
  // The comparison would pass vacuously if the key were stored some other way.
  expect(found.credentials, 'the API key is stored in the AI credentials').toBe(true);
  expect(found.sync, 'the API key is not in synced storage').toBe(false);
  expect(found.activity, 'the API key is not in the AI activity log').toBe(false);
  expect(found.otherLocal, 'the API key is in no other local item').toBe(false);
  expect(found.session, 'the API key is not in session storage').toBe(false);

  const entries =
    (await readStored<{ source: string; status?: number }[]>(worker, STORAGE_ITEMS.aiActivity)) ??
    [];
  const recorded = new Set(entries.map((entry) => entry.source));
  for (const source of sources) {
    expect(recorded.has(source), `the AI activity log has a "${source}" request`).toBe(true);
  }
}
