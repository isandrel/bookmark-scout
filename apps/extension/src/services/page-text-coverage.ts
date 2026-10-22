/**
 * Index Page Text beyond a run: how much of the library the index covers (Options), and deleting
 * the text of sites whose website access is taken back (the background). Apart from
 * `page-text.ts`, which the popup loads to index the current tab, so this code stays out of it.
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
  skipReason: z.enum(['credentials', 'sensitiveParam']).optional(),
  sameAs: z.string().optional(),
}) satisfies z.ZodType<PageTextScanItem>;

/** How much of the library the index covers, for Options. */
export type PageTextCoverage = {
  /** Bookmarks whose page may be indexed: web pages, not skipped by the settings. */
  eligible: number;
  /** Of them, those indexed from their address by the current extractor. */
  indexed: number;
  /** Of them, those indexed from another address or by an older extractor: indexed again on the next run. */
  stale: number;
  /** Bookmarks the newest finished run could not read, still at the address it tried. */
  failed: PageTextScanItem[];
};

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
  const coverage: PageTextCoverage = { eligible: 0, indexed: 0, stale: 0, failed: [] };
  for (const [id, url] of urls) {
    const record = indexed.get(id);
    const need = pageTextNeed(url, record, options, isSensitiveParam);
    if (need.status === 'skipped') continue;
    coverage.eligible += 1;
    if (need.status === 'current') coverage.indexed += 1;
    else if (record) coverage.stale += 1;
  }
  coverage.failed = (await lastPageTextRun()).filter(
    (item) =>
      item.status === 'failed' &&
      urls.get(item.id) === item.url &&
      !isPageTextCurrent(indexed.get(item.id), item.url),
  );
  return coverage;
}

/**
 * Deletes the text of indexed pages that `removedOrigins` (host patterns whose website access was
 * just taken back) covered, unless the extension can still reach the page's site another way
 * (all websites, or the site on its own): text is kept only from sites the user still allows.
 * Returns how many pages' text was deleted.
 */
export async function purgePageTextsWithoutAccess(
  removedOrigins: readonly string[],
  hasAccess: (site: string) => Promise<boolean> = hasWebSiteAccess,
): Promise<number> {
  if (removedOrigins.length === 0) return 0;
  const access = new Map<string, Promise<boolean>>();
  const gone: string[] = [];
  for (const page of (await getPageTexts()).values()) {
    if (!removedOrigins.some((origin) => isUrlInOrigin(page.url, origin))) continue;
    const site = getUrlSite(page.url);
    if (site && !access.has(site)) access.set(site, hasAccess(site));
    if (!site || !(await access.get(site))) gone.push(page.bookmarkId);
  }
  return removePageTexts(gone);
}

/**
 * Deletes indexed text when website access is taken back (`purgePageTextsWithoutAccess`), in
 * Options, in the browser's own settings, or by Firefox. Registered synchronously by the
 * background, so the event wakes a stopped worker.
 */
export function registerPageTextAccessCleanup(): void {
  browser.permissions?.onRemoved?.addListener(({ origins }) => {
    void purgePageTextsWithoutAccess(origins ?? []).catch((error: unknown) => {
      console.error('[PageText] Failed to delete text of sites no longer allowed:', error);
    });
  });
}
