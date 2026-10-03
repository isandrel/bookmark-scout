/**
 * Reads the main text of web pages for AI tools: downloads the page without cookies, keeps the
 * article with Mozilla Readability, and converts it to compact Markdown. Page text is untrusted
 * input; callers send it to the model as data, never as instructions. Limits come from
 * config/ai/page-reading.toml.
 */
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { z } from 'zod';

const config = readConfig(
  'ai/page-reading',
  z.strictObject({
    timeout_ms: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
    max_chars_per_page: z.number().int().positive(),
    max_pages_per_run: z.number().int().nonnegative(),
    concurrency: z.number().int().positive(),
    skip_private_hosts: z.boolean(),
    private_host_suffixes: z.array(z.string().min(1)),
  }),
);

export type PageText = {
  /** The page's own title, which can be better than an old bookmark title. */
  title?: string;
  /** Readable text as Markdown, cut to the configured length. */
  text: string;
};

/** IPv4 ranges that are not reachable from the public internet (RFC 1918, 6598, 3927, 1122). */
const PRIVATE_IPV4_RANGES: readonly [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0a80000, 16], // 192.168.0.0/16
];

function parseIPv4(host: string): number | undefined {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return undefined;
  const bytes = parts.map(Number);
  if (bytes.some((byte) => byte > 255)) return undefined;
  return bytes.reduce((value, byte) => value * 256 + byte, 0);
}

function isPrivateIPv4(host: string): boolean {
  const address = parseIPv4(host);
  if (address === undefined) return false;
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(address / size) === Math.floor(base / size);
  });
}

function isPrivateIPv6(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!address.includes(':')) return false;
  if (address === '::' || address === '::1') return true;
  // IPv4-mapped addresses (::ffff:10.0.0.1) inherit the IPv4 answer.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // fc00::/7 unique local and fe80::/10 link local.
  return /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
}

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

/** Whether a URL may be read: web URLs only, and local hosts only when the config allows it. */
export function isReadablePageUrl(url: string): boolean {
  if (!isWebUrl(url)) return false;
  return !config.skip_private_hosts || !isPrivateHost(new URL(url).hostname);
}

function createTurndown(): TurndownService {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  // Keep link and image text only: addresses cost tokens and say little about the topic.
  turndown.addRule('linkText', { filter: 'a', replacement: (content) => content });
  turndown.remove(['img', 'picture', 'video', 'audio', 'iframe', 'script', 'style']);
  return turndown;
}

function collapseText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The readable text of a parsed page, or undefined when it has none. */
export function extractPageText(doc: Document, maxChars = config.max_chars_per_page): PageText | undefined {
  const title = doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
  const description =
    doc.querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute('content')
      ?.trim() ?? '';
  // Readability changes the document it reads, so it gets a copy.
  const article = new Readability(doc.cloneNode(true) as Document).parse();
  const body = article?.content
    ? createTurndown().turndown(article.content)
    : (doc.body?.textContent ?? '');
  const text = collapseText([description, body].filter(Boolean).join('\n\n'));
  if (!text) return undefined;
  return { title: article?.title?.trim() || title, text: text.slice(0, maxChars) };
}

/** Downloads and reads one page; undefined when it cannot or may not be read. */
export async function readPageText(url: string): Promise<PageText | undefined> {
  if (!isReadablePageUrl(url)) return undefined;
  try {
    const html = await requestWithTimeout(
      url,
      { method: 'GET', redirect: 'follow' },
      config.timeout_ms,
      async (response) => {
        // A redirect can lead to a local host; that page is not read either.
        if (!response.ok || !isHtmlContentType(response.headers.get('content-type'))) return null;
        if (response.url && !isReadablePageUrl(response.url)) return null;
        const bytes = await readResponseBytes(response, config.max_bytes);
        return decodeHtml(bytes, response.headers.get('content-type'));
      },
    );
    if (!html) return undefined;
    return extractPageText(new DOMParser().parseFromString(html, 'text/html'));
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
  if (!enabled || !(await hasWebHostAccess())) return items;
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
  const unique = [...new Set(urls.filter(isReadablePageUrl))].slice(0, config.max_pages_per_run);
  const pages = await mapWithConcurrency(unique, config.concurrency, async (url) => ({
    url,
    page: await readPageText(url),
  }));
  return new Map(
    pages.flatMap(({ url, page }) => (page ? [[url, page] as [string, PageText]] : [])),
  );
}
