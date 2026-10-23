/**
 * The built-in search (`search-documents.ts`) against MiniSearch and FlexSearch on the 19,500
 * bookmark library of the performance suite (`[library]` in `tests/perf/perf.toml`, the names
 * `seedLibrary` in `tests/perf/harness.ts` gives it): how long building the index takes, how long
 * a few plain-word queries take, how many results each finds, and how much heap the index keeps.
 * Dev only: both libraries are dev dependencies and nothing here is shipped. Run with
 * `bun run --cwd apps/extension bench:search`; the recorded results and the decision are in
 * `.agents/skills/extension-performance/references/search-engines.md`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Document } from 'flexsearch';
import MiniSearch from 'minisearch';
import { parse } from 'smol-toml';
import { expect, it } from 'vitest';
import { buildSearchDocuments, foldSearchDocument, searchDocuments } from '@/lib/search-documents';
import { parseSearchQuery } from '@/lib/search-query';
import type { BookmarkTreeNode } from '@/types';

const BUILD_RUNS = 5;
const QUERY_RUNS = 30;
/** Above the library's size, so neither library cuts its results short. */
const RESULT_LIMIT = 100_000;
/** Plain words, which all three read; operators (`tag:`, `after:`) only the built-in search has. */
const QUERIES = {
  page: 'Page 15-3-7',
  topicNumber: 'Topic 12',
  address: 'example.com/15/3',
  prefix: 'pag 29-49',
  none: 'nowhere',
};

const library = (
  parse(readFileSync(path.resolve(import.meta.dirname, '../perf/perf.toml'), 'utf8')) as {
    library: { areas: number; topics_per_area: number; pages_per_topic: number; url_base: string };
  }
).library;

/** A fresh copy of the performance library, so no engine reuses work cached on the nodes. */
function makeLibrary(): BookmarkTreeNode[] {
  let nextId = 10;
  const node = (title: string, extra: Partial<BookmarkTreeNode>): BookmarkTreeNode => ({
    id: String(nextId++),
    title,
    syncing: false,
    ...extra,
  });
  const areas = Array.from({ length: library.areas }, (_, a) =>
    node(`Area ${a}`, {
      children: Array.from({ length: library.topics_per_area }, (_, b) =>
        node(`Topic ${a}-${b}`, {
          children: Array.from({ length: library.pages_per_topic }, (_, c) =>
            node(`Page ${a}-${b}-${c}`, { url: `${library.url_base}/${a}/${b}/${c}` }),
          ),
        }),
      ),
    }),
  );
  const roots: BookmarkTreeNode[] = [
    { id: '0', title: '', syncing: false, children: [node('Bookmarks bar', { children: areas })] },
  ];
  // As the browser gives it: every node but the root names its parent.
  const linkParents = (nodes: readonly BookmarkTreeNode[], parentId?: string) => {
    for (const item of nodes) {
      if (parentId) item.parentId = parentId;
      if (item.children) linkParents(item.children, item.id);
    }
  };
  linkParents(roots);
  return roots;
}

type FlatRecord = { id: string; title: string; url: string; folderPath: string; host: string };

/** What the libraries index: the fields the built-in search reads without metadata. */
function flatRecords(roots: readonly BookmarkTreeNode[]): FlatRecord[] {
  const records: FlatRecord[] = [];
  const walk = (nodes: readonly BookmarkTreeNode[], folders: string[], container: boolean) => {
    for (const item of nodes) {
      if (!container) {
        const host = item.url ? new URL(item.url).hostname.replace(/^www\./, '') : '';
        records.push({
          id: item.id,
          title: item.title,
          url: item.url ?? '',
          folderPath: folders.join(' / '),
          host,
        });
      }
      if (item.children) {
        walk(item.children, container ? folders : [...folders, item.title], item.id === '0');
      }
    }
  };
  walk(roots, [], true);
  return records;
}

type Engine = {
  name: string;
  build: (roots: readonly BookmarkTreeNode[]) => unknown;
  query: (index: unknown, text: string) => number;
};

const MINISEARCH_OPTIONS = {
  fields: ['title', 'url', 'folderPath', 'host'],
  searchOptions: { prefix: true, combineWith: 'AND' as const },
};

const engines: Engine[] = [
  {
    name: 'built-in',
    build: (roots) => {
      const documents = buildSearchDocuments(roots, {});
      // As `prepareSearchDocuments` does before the first keystroke.
      for (const document of documents) foldSearchDocument(document);
      return documents;
    },
    query: (index, text) =>
      searchDocuments(
        index as ReturnType<typeof buildSearchDocuments>,
        parseSearchQuery(text).query,
      ).length,
  },
  {
    name: 'MiniSearch',
    build: (roots) => {
      const index = new MiniSearch<FlatRecord>(MINISEARCH_OPTIONS);
      index.addAll(flatRecords(roots));
      return index;
    },
    query: (index, text) => (index as MiniSearch<FlatRecord>).search(text).length,
  },
  {
    name: 'FlexSearch',
    build: (roots) => {
      const index = new Document({
        document: { id: 'id', index: ['title', 'url', 'folderPath', 'host'] },
        tokenize: 'forward',
      });
      for (const record of flatRecords(roots)) index.add(record);
      return index;
    },
    query: (index, text) =>
      (index as Document).search(text, { limit: RESULT_LIMIT, merge: true }).length,
  },
];

setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

it('compares the built-in search with MiniSearch and FlexSearch on 19,500 bookmarks', () => {
  const rows: Record<string, Record<string, number>> = {};
  const counts: Record<string, Record<string, number>> = {};
  for (const engine of engines) {
    // Heap the index keeps, after a full collection on both sides.
    collectGarbage();
    const before = process.memoryUsage().heapUsed;
    let index = engine.build(makeLibrary());
    collectGarbage();
    const retainedMb = (process.memoryUsage().heapUsed - before) / 2 ** 20;

    const builds: number[] = [];
    for (let run = 0; run < BUILD_RUNS; run += 1) {
      const roots = makeLibrary();
      const started = performance.now();
      index = engine.build(roots);
      builds.push(performance.now() - started);
    }
    const row: Record<string, number> = {
      buildMs: round(median(builds)),
      heapMb: round(retainedMb),
    };
    counts[engine.name] = {};
    for (const [name, text] of Object.entries(QUERIES)) {
      const times: number[] = [];
      let found = 0;
      for (let run = 0; run < QUERY_RUNS; run += 1) {
        const started = performance.now();
        found = engine.query(index, text);
        times.push(performance.now() - started);
      }
      row[`${name}Ms`] = round(median(times), 2);
      counts[engine.name][name] = found;
    }
    rows[engine.name] = row;
  }
  console.log(`Library: ${flatRecords(makeLibrary()).length} bookmarks and folders`);
  console.table(rows);
  console.log('Results found (the engines read the words differently):');
  console.table(counts);
  // Each engine found the one page the exact query names, and none found a word in no item.
  for (const engine of engines) {
    expect(counts[engine.name]?.page, engine.name).toBeGreaterThanOrEqual(1);
    expect(counts[engine.name]?.none, engine.name).toBe(0);
  }
});
