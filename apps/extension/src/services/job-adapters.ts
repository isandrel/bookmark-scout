/**
 * What each kind of background job does (`services/job-coordinator.ts` runs them): one table
 * entry per kind, so a new kind is a new entry. An adapter reads its scope and settings when the
 * job is accepted, and then checks one stored item at a time from those frozen inputs.
 */
import { z } from 'zod';

/** What one item came to, and the result its tool's review shows. */
export type JobRun = { outcome: ItemOutcome; result: unknown };

/** What a slice's items share; set up once per slice by the coordinator. */
export type JobTools = {
  /** Reads a fetched page's `<head>`; a service worker has no DOM parser of its own. */
  readHead(html: string, descriptions: boolean): Promise<HtmlHead>;
};

export type JobStart = JobCommand & { type: 'start' };

/** How one kind of job does its work, from its frozen options and stored inputs. */
export type JobAdapter = {
  /** The inputs (one per item), options, and scope counts for a new job; read on acceptance. */
  prepare(command: JobStart): Promise<{
    inputs: unknown[];
    options: unknown;
    label: string;
    summary?: Record<string, number>;
  }>;
  /** Items checked at the same time. */
  concurrency(options: unknown): number;
  /** Whether items read HTML, so the slice needs `JobTools.readHead`. */
  readsHtml?: boolean;
  /** Does one item; throws `RequestAbortedError` when stopped, which leaves it to do. */
  run(input: unknown, options: unknown, signal: AbortSignal, tools: JobTools): Promise<JobRun>;
};

const linkTargetSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  folderPath: z.string(),
});
const requestOptions = {
  requestTimeoutMs: z.number().int().positive(),
  concurrency: z.number().int().positive(),
};
const deadLinkOptionsSchema = z.strictObject({
  ...requestOptions,
  retryCount: z.number().int().nonnegative(),
  followRedirects: z.boolean(),
  successStatuses: z.array(httpStatusCodeSchema),
  allSitesAccess: z.boolean().optional(),
});
const metadataOptionsSchema = z.strictObject({
  ...requestOptions,
  overwriteTitles: z.boolean(),
  fetchDescriptions: z.boolean(),
});
const siteIconOptionsSchema = z.strictObject({
  ...requestOptions,
  preferredSize: z.number().int().positive(),
  maxIconBytes: z.number().int().positive(),
});
const originGroupSchema = z.strictObject({
  origin: z.string(),
  pageUrl: z.string(),
  bookmarkCount: z.number().int().positive(),
});

/** The bookmarks of a Start's scope, read from the browser now, never from a page's tree. */
async function scopeNodes(command: JobStart) {
  const tree = await fetchBookmarkTree();
  const folderId = command.scope.mode === 'folder' ? command.scope.folderId : null;
  const nodes = getScopedNodes(tree, folderId, command.scope.mode);
  const label = folderId ? getBookmarkDisplayTitle(nodes[0]?.title) : '';
  return { nodes, label };
}

/** The tool's settings now, as a job keeps them for its whole run. */
async function toolOptions() {
  return getToolOptions(await getSettings());
}

export const JOB_ADAPTERS: Record<JobKind, JobAdapter> = {
  deadLinks: {
    async prepare(command) {
      const { nodes, label } = await scopeNodes(command);
      const options = {
        ...(await toolOptions()).deadLinks,
        // Granted only the bookmarks' own sites, a redirect elsewhere is not a confirmed loop.
        allSitesAccess: await hasPermission('webAccess'),
      };
      return { inputs: linkTargets(nodes), options, label };
    },
    concurrency: (options) => deadLinkOptionsSchema.parse(options).concurrency,
    async run(input, options, signal) {
      const result = await checkDeadLink(
        linkTargetSchema.parse(input),
        deadLinkOptionsSchema.parse(options),
        signal,
      );
      // Not a web address: nothing to check.
      const skipped = result.status === 'skipped' || result.status === 'invalid';
      return { outcome: skipped ? 'skipped' : 'succeeded', result };
    },
  },
  metadataFetcher: {
    async prepare(command) {
      const { nodes, label } = await scopeNodes(command);
      return { inputs: linkTargets(nodes), options: (await toolOptions()).metadataFetcher, label };
    },
    concurrency: (options) => metadataOptionsSchema.parse(options).concurrency,
    readsHtml: true,
    async run(input, options, signal, tools) {
      const parsed = metadataOptionsSchema.parse(options);
      const result = await fetchMetadataItem(
        linkTargetSchema.parse(input),
        parsed,
        (html) => tools.readHead(html, parsed.fetchDescriptions),
        signal,
      );
      // A page that could not be loaded at all could not be checked; an error page could.
      const outcome =
        result.status === 'skipped'
          ? 'skipped'
          : result.status === 'timeout' || result.status === 'error'
            ? 'failed'
            : 'succeeded';
      return { outcome, result };
    },
  },
  siteIcons: {
    async prepare(command) {
      const { nodes, label } = await scopeNodes(command);
      const { groups, scannedBookmarks, skippedBookmarks } = groupBookmarksByOrigin(nodes);
      return {
        inputs: groups,
        options: (await toolOptions()).siteIcons,
        label,
        summary: { scannedBookmarks, skippedBookmarks },
      };
    },
    concurrency: (options) => siteIconOptionsSchema.parse(options).concurrency,
    async run(input, options, signal) {
      const group = originGroupSchema.parse(input);
      // Read when the origin is checked, so an icon saved meanwhile counts as unchanged.
      const cached = (await getSiteIconCache())[group.origin]?.icon;
      const result = await refreshOrigin(
        group,
        siteIconOptionsSchema.parse(options),
        cached,
        signal,
      );
      return { outcome: result.status === 'failed' ? 'failed' : 'succeeded', result };
    },
  },
};
