/**
 * Index Page Text beyond a run: how much of the library the index covers (Options), and deleting
 * page text that must not be kept (the background): of deleted bookmarks, of sites whose website
 * access is taken back, and of sites the user chose never to read. Text is deleted from the index
 * and from the saved results of runs (the job store), which also drop their text once a review is
 * saved (`dropReviewedPageText`). Apart from `page-text.ts`, which the popup loads to index the
 * current tab, so this code stays out of it.
 */
import { z } from 'zod';

/** A saved result of a run, as the job store keeps it; one that does not parse is ignored. */
export const pageTextScanItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  folderPath: z.string(),
  readFrom: z.string().optional(),
  status: z.enum([
    'read',
    'empty',
    'unsupported',
    'signIn',
    'redirected',
    'failed',
    'current',
    'notChosen',
    'skipped',
  ]),
  text: z.string().optional(),
  truncated: z.boolean().optional(),
  skipReason: z.enum(['credentials', 'sensitiveParam', 'excludedSite']).optional(),
  sameAs: z.string().optional(),
}) satisfies z.ZodType<PageTextScanItem>;

/** A bookmark Options can start a run on: its id and current address. */
export type PageTextTarget = { id: string; url: string };

/** How much of the library the index covers, for Options. */
export type PageTextCoverage = {
  /** Bookmarks whose page may be indexed: web pages, not skipped by the settings. */
  eligible: number;
  /** Of them, those indexed from their address by the current extractor. */
  indexed: number;
  /**
   * Of them, those indexed from another address, by an older extractor, or before provenance was
   * kept: indexed again on the next run, or by Refresh outdated.
   */
  outdated: PageTextTarget[];
  /** Bookmarks the newest finished run could not read, still at the address it tried. */
  failed: PageTextScanItem[];
  /** When the newest text of an eligible bookmark was indexed; undefined when none is. */
  lastIndexedAt?: number;
};

/**
 * Removes the text from saved Index Page Text results that `drop` picks (only finished runs with
 * `finishedOnly`); the rest of each result stays, so the run still says what it found. Resolves
 * to how many results lost their text.
 */
async function dropPageTextFromRuns(
  drop: (item: PageTextScanItem) => boolean,
  options?: { finishedOnly: boolean },
): Promise<number> {
  return rewriteJobResults(
    'pageText',
    (result) => {
      const item = pageTextScanItemSchema.safeParse(result);
      if (!item.success || item.data.text === undefined || !drop(item.data)) return undefined;
      // The stored result as it is, without its text: fields this release does not know stay.
      const { text: _text, ...rest } = result as Record<string, unknown>;
      return rest;
    },
    options,
  );
}

/**
 * Once a review of a finished run is saved, its results keep no text: what the user kept is in
 * the index, and what they skipped is not kept anywhere. `reviewed` are the review's bookmarks.
 */
export async function dropReviewedPageText(reviewed: ReadonlySet<string>): Promise<number> {
  return dropPageTextFromRuns((item) => reviewed.has(item.id), { finishedOnly: true });
}

/** Bookmarks deleted whose text is still to be dropped from saved results. */
let deletedQueue = new Set<string>();
let droppingDeleted = false;

/**
 * Deletes the text of the bookmarks `ids` just deleted (the background, on every removal): from
 * the index at once, and from saved results of runs, one pass over them for every burst of
 * removals (a removal that comes during a pass joins the next). Resolves once the index is done.
 */
export async function forgetDeletedPageTexts(ids: readonly string[]): Promise<number> {
  for (const id of ids) deletedQueue.add(id);
  if (!droppingDeleted) {
    droppingDeleted = true;
    void (async () => {
      try {
        while (deletedQueue.size > 0) {
          const batch = deletedQueue;
          deletedQueue = new Set();
          await dropPageTextFromRuns((item) => batch.has(item.id));
        }
      } catch (error) {
        console.error('[PageText] Failed to delete text of deleted bookmarks from runs:', error);
      } finally {
        droppingDeleted = false;
      }
    })();
  }
  return removePageTexts(ids);
}

/** Results of the newest Index Page Text run, once it has finished; none otherwise. */
async function lastPageTextRun(): Promise<PageTextScanItem[]> {
  const job = (await listJobs()).find((candidate) => candidate.kind === 'pageText');
  if (!job || !FINISHED_JOB_STATES.has(job.state)) return [];
  const results = (await readJobResults(job.id)).flatMap((result) => {
    const parsed = pageTextScanItemSchema.safeParse(result);
    return parsed.success ? [parsed.data] : [];
  });
  return sharePageTextReads(results);
}

/** What the index covers of the whole library, with the settings Index Page Text runs with now. */
export async function getPageTextCoverage(): Promise<PageTextCoverage> {
  const [urls, settings, indexed] = await Promise.all([
    fetchBookmarkUrls(),
    getSettings(),
    getPageTexts(),
  ]);
  const options = getToolOptions(settings).pageText;
  const isSensitiveParam = createParamNameMatcher(options.sensitiveParams);
  const coverage: PageTextCoverage = { eligible: 0, indexed: 0, outdated: [], failed: [] };
  for (const [id, url] of urls) {
    const record = indexed.get(id);
    const need = pageTextNeed(url, record, options, isSensitiveParam);
    if (need.status === 'skipped') continue;
    coverage.eligible += 1;
    if (need.status === 'current') coverage.indexed += 1;
    else if (record) coverage.outdated.push({ id, url });
    if (record && record.indexedAt > (coverage.lastIndexedAt ?? Number.NEGATIVE_INFINITY)) {
      coverage.lastIndexedAt = record.indexedAt;
    }
  }
  coverage.failed = (await lastPageTextRun()).filter(
    (item) =>
      item.status === 'failed' &&
      urls.get(item.id) === item.url &&
      !isPageTextCurrent(indexed.get(item.id), item.url),
  );
  return coverage;
}

/** Every address saved Index Page Text results were read from, of runs in any state. */
async function pageTextRunAddresses(): Promise<string[]> {
  const jobs = (await listJobs(Number.POSITIVE_INFINITY)).filter((job) => job.kind === 'pageText');
  const addresses: string[] = [];
  for (const job of jobs) {
    for (const result of await readJobResults(job.id)) {
      const item = pageTextScanItemSchema.safeParse(result);
      if (item.success && item.data.text !== undefined) {
        addresses.push(...pageTextAddresses(item.data));
      }
    }
  }
  return addresses;
}

/**
 * Deletes the text of indexed pages, and of saved results of runs, that `removedOrigins` (host
 * patterns whose website access was just taken back) covered, by the bookmark's address or the
 * one its text was read from, unless the extension can still reach that site another way (all
 * websites, or the site on its own): text is kept only from sites the user still allows. Returns
 * how many pages' text was deleted from the index.
 */
export async function purgePageTextsWithoutAccess(
  removedOrigins: readonly string[],
  hasAccess: (site: string) => Promise<boolean> = hasWebSiteAccess,
): Promise<number> {
  if (removedOrigins.length === 0) return 0;
  const pages = [...(await getPageTexts()).values()];
  const addresses = [
    ...pages.flatMap((page) => [page.url, ...(page.provenance ? [page.provenance.readFrom] : [])]),
    ...(await pageTextRunAddresses()),
  ];
  // Which sites lost access, asked once a site, so the checks below can stay synchronous.
  const lost = new Set<string>();
  const asked = new Set<string>();
  for (const url of addresses) {
    if (!removedOrigins.some((origin) => isUrlInOrigin(url, origin))) continue;
    const site = getUrlSite(url) ?? '';
    if (asked.has(site)) continue;
    asked.add(site);
    if (!site || !(await hasAccess(site))) lost.add(site);
  }
  if (lost.size === 0) return 0;
  const isLost = (url: string) =>
    removedOrigins.some((origin) => isUrlInOrigin(url, origin)) && lost.has(getUrlSite(url) ?? '');
  await dropPageTextFromRuns((item) => pageTextAddresses(item).some(isLost));
  return removePageTexts(
    pages.flatMap((page) =>
      isLost(page.url) || (page.provenance && isLost(page.provenance.readFrom))
        ? [page.bookmarkId]
        : [],
    ),
  );
}

/**
 * Deletes the text of indexed pages, and of saved results of runs, on `sites` (Never Read These
 * Sites) or their subdomains, by the bookmark's address or the one its text was read from;
 * returns how many pages' text was deleted from the index.
 */
export async function purgePageTextsOfSites(sites: readonly string[]): Promise<number> {
  if (sites.length === 0) return 0;
  const onSites = (url: string) => isUrlOnSites(url, sites);
  await dropPageTextFromRuns((item) => pageTextAddresses(item).some(onSites));
  const gone = [...(await getPageTexts()).values()].flatMap((page) =>
    onSites(page.url) || (page.provenance && onSites(page.provenance.readFrom))
      ? [page.bookmarkId]
      : [],
  );
  return removePageTexts(gone);
}

/**
 * Deletes indexed text when website access is taken back (`purgePageTextsWithoutAccess`), in
 * Options, in the browser's own settings, or by Firefox, and when the user adds sites to Never
 * Read These Sites, here or on another device (`purgePageTextsOfSites`). Registered synchronously
 * by the background, so each event wakes a stopped worker.
 */
export function registerPageTextAccessCleanup(): void {
  browser.permissions?.onRemoved?.addListener(({ origins }) => {
    void purgePageTextsWithoutAccess(origins ?? []).catch((error: unknown) => {
      console.error('[PageText] Failed to delete text of sites no longer allowed:', error);
    });
  });
  // The stored value reports only the new settings, so the list seen last is kept: the index is
  // read only when the list changes, not on every change to another setting.
  let excluded: readonly string[] | undefined;
  void settingsValue
    .get()
    .then((settings) => {
      excluded ??= settings.pageTextExcludedSites;
    })
    .catch(() => undefined);
  settingsValue.watch((settings) => {
    const before = excluded;
    excluded = settings.pageTextExcludedSites;
    if (before && isSameJson(before, excluded)) return;
    void purgePageTextsOfSites(excluded).catch((error: unknown) => {
      console.error('[PageText] Failed to delete text of sites never to read:', error);
    });
  });
}
