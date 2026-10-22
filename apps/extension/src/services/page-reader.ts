/**
 * Reads the main text of web pages for AI tools: downloads the page without cookies, keeps the
 * article with Mozilla Readability, and converts it to compact Markdown. Page text is untrusted
 * input; callers send it to the model as data, never as instructions. Limits come from
 * config/ai/page-reading.toml. Readability and Turndown are in page-reader.lazy.ts and load on
 * the first page read, so pages that never read one do not parse them at start.
 */
import { z } from 'zod';

const config = readConfig(
  'ai/page-reading',
  z.strictObject({
    timeout_ms: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
    max_chars_per_page: z.number().int().positive(),
    max_pages_per_run: z.number().int().nonnegative(),
    concurrency: z.number().int().positive(),
    private_host_suffixes: z.array(z.string().min(1)),
    drop_elements: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)),
  }),
);

export type PageText = {
  /** The page's own title, which can be better than an old bookmark title. */
  title?: string;
  /** Readable text as Markdown, cut to the configured length. */
  text: string;
};

/**
 * True for hosts on the local network: private and loopback addresses, and names ending in a
 * configured local suffix such as `localhost`. A public name that resolves to a private address
 * cannot be detected from an extension page.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return true;
  return config.private_host_suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * Whether a URL may be read: web URLs only, and local hosts only when the Skip Local Network
 * Pages setting is off.
 */
export function isReadablePageUrl(url: string, skipPrivateHosts: boolean): boolean {
  if (!isWebUrl(url)) return false;
  return !skipPrivateHosts || !isPrivateHost(new URL(url).hostname);
}

/** The readable text of a parsed page, or undefined when it has none. */
export async function extractPageText(
  doc: Document,
  maxChars = config.max_chars_per_page,
): Promise<PageText | undefined> {
  const { extractReadableText } = await import('./page-reader.lazy');
  return extractReadableText(doc, { maxChars, dropElements: config.drop_elements });
}

/** Downloads and reads one page; undefined when it cannot or may not be read. */
export async function readPageText(url: string): Promise<PageText | undefined> {
  const { readPageSkipPrivateHosts } = await getSettings();
  if (!isReadablePageUrl(url, readPageSkipPrivateHosts)) return undefined;
  try {
    const { html } = await fetchHtmlPage(url, {
      timeoutMs: config.timeout_ms,
      maxBytes: config.max_bytes,
      until: 'end',
      // A redirect can lead to a local host; that page is not read either.
      allowUrl: (next) => isReadablePageUrl(next, readPageSkipPrivateHosts),
    });
    if (!html) return undefined;
    return await extractPageText(parseFetchedHtml(html));
  } catch {
    // Unreachable pages are sent with their title and URL only.
    return undefined;
  }
}

/**
 * Adds `pageTitle` and `pageText` to the items whose page could be read, when page reading is on
 * and website access is granted; otherwise returns the items as they are.
 */
export async function addPageText<Item extends { url: string }>(
  items: Item[],
  enabled: boolean,
): Promise<(Item & { pageTitle?: string; pageText?: string })[]> {
  if (!enabled || !(await hasPermission('pageReading'))) return items;
  const pages = await readPagesText(items.map((item) => item.url));
  return items.map((item) => {
    const page = pages.get(item.url);
    return page ? { ...item, pageTitle: page.title, pageText: page.text } : item;
  });
}

/**
 * Reads up to the configured number of pages, a few at a time. The result maps each URL that
 * was read to its text; the rest are missing.
 */
export async function readPagesText(urls: string[]): Promise<Map<string, PageText>> {
  const { readPageSkipPrivateHosts } = await getSettings();
  const unique = [
    ...new Set(urls.filter((url) => isReadablePageUrl(url, readPageSkipPrivateHosts))),
  ].slice(0, config.max_pages_per_run);
  const pages = await mapWithConcurrency(unique, config.concurrency, async (url) => ({
    url,
    page: await readPageText(url),
  }));
  return new Map(
    pages.flatMap(({ url, page }) => (page ? [[url, page] as [string, PageText]] : [])),
  );
}
