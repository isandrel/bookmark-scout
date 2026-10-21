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
  /** The AI host page with the job's AI service, for a kind with `ai`. */
  ai?: AIHostSession;
};

/**
 * Stops a job until the user acts: it is paused with the reason, never retried on its own. The
 * item in progress stays to do. `detail` is a message already in the user's language.
 */
export class JobBlockedError extends Error {
  constructor(
    readonly code: JobBlockCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'JobBlockedError';
  }
}

/**
 * Where a job's AI requests go, as a digest of the provider, model, and endpoint (never the key):
 * the job keeps it, and stops when the service changed, so the rest is never sent elsewhere.
 */
export async function aiDestination(settings: AISettings): Promise<string> {
  const text = JSON.stringify([settings.provider, settings.model, settings.baseUrl ?? null]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(HEX_RADIX).padStart(2, '0'))
    .join('');
}
const HEX_RADIX = 16;

export type JobStart = JobCommand & { type: 'start' };

/** A part of a job whose slices are one change each (`runBatch`): which, and of how many. */
export type JobPart = { jobId: string; index: number; of: number };

type JobAdapterBase = {
  /**
   * The inputs (one per item), options, and scope counts for a new job; read on acceptance.
   * Absent for a kind whose inputs come with its command (`applyChanges`).
   */
  prepare?(command: JobStart): Promise<{
    inputs: unknown[];
    options: unknown;
    label: string;
    summary?: Record<string, number>;
  }>;
  /**
   * Items whose work cannot be taken back once started (a paid request, a bookmark write) are
   * marked in flight first. A stopped worker leaves the mark, and the job then pauses with this
   * reason instead of doing that work again on its own.
   */
  unsureAfterStop?: JobBlockCode;
  /** Whether items read HTML, so the slice needs `JobTools.readHead`. */
  readsHtml?: boolean;
  /**
   * Items send AI requests, which may cost money: the slice opens the AI host page with the
   * feature's current service, checked against the one the job started with (`destination`),
   * and a request a stopped worker left unanswered is sent again only once the user resumes.
   */
  ai?: { feature: AIFeature; source: AIActivitySource; destination(options: unknown): string };
};

/** How one kind of job does its work, from its frozen options and stored inputs. */
export type JobAdapter = JobAdapterBase &
  (
    | {
        /** Items checked at the same time. */
        concurrency(options: unknown): number;
        /** Does one item; throws `RequestAbortedError` when stopped, which leaves it to do. */
        run(
          input: unknown,
          options: unknown,
          signal: AbortSignal,
          tools: JobTools,
        ): Promise<JobRun>;
      }
    | {
        /**
         * Does a whole slice as one step that is not stopped halfway (one recorded change), and
         * returns each item's outcome in order. Pause and cancel take effect between slices.
         */
        runBatch(inputs: unknown[], options: unknown, part: JobPart): Promise<JobRun[]>;
      }
  );

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
  reorganization: {
    async prepare(command) {
      const { nodes, label } = await scopeNodes(command);
      const settings = await getSettings();
      const { context, batches } = await prepareReorganization(
        nodes,
        getToolOptions(settings).reorganization,
      );
      const service = await getActiveAISettings(settings.aiEnabled, 'reorganization');
      return {
        inputs: batches,
        options: { context, destination: await aiDestination(service) },
        label,
      };
    },
    // One request at a time, in order, as the page did.
    concurrency: () => 1,
    unsureAfterStop: 'uncertain-request',
    ai: {
      feature: 'reorganization',
      source: 'reorganization',
      destination: (options) => reorganizationJobOptionsSchema.parse(options).destination,
    },
    // An AI request cannot be taken back once sent, so a pause lets the one in flight finish.
    async run(input, options, _signal, tools) {
      if (!tools.ai) throw new JobBlockedError('slice-setup');
      const { context } = reorganizationJobOptionsSchema.parse(options);
      const bookmarks = reorganizationBatchSchema.parse(input);
      try {
        const response = await tools.ai.generate({
          schema: 'reorganization',
          system: context.system,
          prompt: JSON.stringify(reorganizationRequest(context, bookmarks)),
        });
        return { outcome: 'succeeded', result: { bookmarks, response } };
      } catch (error) {
        // An answer that did not fit loses this batch only; the plan keeps the others.
        if (error instanceof AIHostError && error.kind === 'answer') {
          return { outcome: 'failed', result: { bookmarks } };
        }
        throw new JobBlockedError('ai-request', getErrorMessage(error));
      }
    },
  },
  applyChanges: {
    // A part that stopped halfway is checked item by item again on Resume; nothing is replayed
    // on its own.
    unsureAfterStop: 'uncertain-write',
    async runBatch(inputs, options, part) {
      const changes = inputs.map((input) => storedBookmarkChangeSchema.parse(input));
      const { tool } = applyJobOptionsSchema.parse(options);
      // The same writer as a change applied in the page: each change is checked against the
      // live bookmark first, so one already made, or changed since the review, is skipped.
      const result = await applyBookmarkChanges(changes, { tool, part });
      const issues = new Map(result.issues.map((issue) => [issue.id, issue.reason]));
      return changes.map((change) => {
        const reason = issues.get(change.id);
        const result = { id: change.id, title: change.title, ...(reason ? { reason } : {}) };
        if (!reason) return { outcome: 'succeeded', result };
        return { outcome: reason === 'failed' ? 'failed' : 'skipped', result };
      });
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
