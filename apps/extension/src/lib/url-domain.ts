/**
 * Small, dependency-free approximation of the Public Suffix List for grouping bookmarks by
 * site. It covers the common second-level registries under country-code TLDs (bbc.co.uk,
 * nhk.or.jp, abc.net.au) and a few popular shared hosting suffixes. Exotic suffixes fall back
 * to the last two labels, which only affects how domain chips are grouped.
 */

/** Second-level labels that act as public registries under two-letter country-code TLDs. */
const COUNTRY_SECOND_LEVEL_LABELS = new Set([
  'ac',
  'ad',
  'co',
  'com',
  'ed',
  'edu',
  'go',
  'gob',
  'gov',
  'govt',
  'gr',
  'gv',
  'id',
  'in',
  'lg',
  'ltd',
  'me',
  'mil',
  'ne',
  'net',
  'nhs',
  'nic',
  'nom',
  'or',
  'org',
  'plc',
  'police',
  'sch',
]);

/** Multi-label public suffixes that the country-code rule does not cover. */
const EXTRA_PUBLIC_SUFFIXES = new Set([
  'appspot.com',
  'blogspot.com',
  'cloudfront.net',
  'github.io',
  'gitlab.io',
  'herokuapp.com',
  'netlify.app',
  'pages.dev',
  'vercel.app',
  'workers.dev',
]);

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

/** Lower-cased hostname without a trailing dot, or '' when the URL has none. */
export function getUrlHostname(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

/** The registrable domain ("eTLD+1") for a hostname, e.g. news.bbc.co.uk -> bbc.co.uk. */
export function getRegistrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isIpAddress(host)) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;

  const lastTwo = labels.slice(-2).join('.');
  const [secondLevel, topLevel] = labels.slice(-2);
  const suffixLength =
    EXTRA_PUBLIC_SUFFIXES.has(lastTwo) ||
    (topLevel.length === 2 && COUNTRY_SECOND_LEVEL_LABELS.has(secondLevel))
      ? 2
      : 1;
  return labels.slice(-(suffixLength + 1)).join('.');
}

/** Registrable domain for a bookmark URL, or '' for URLs without a hostname. */
export function getUrlDomain(url: string | undefined): string {
  return getRegistrableDomain(getUrlHostname(url));
}

/** Whether a hostname belongs to a registrable domain (exact host or a subdomain of it). */
export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

const SCRIPT_URL_SCHEMES = new Set(['javascript', 'vbscript']);

/**
 * Whether a URL runs script when opened (bookmarklets). The manager neither saves nor opens
 * these: opening them from an extension page fails, and they are easy to paste by mistake.
 */
export function isScriptUrl(url: string | undefined): boolean {
  if (!url) return false;
  // Browsers ignore leading whitespace/control characters and tabs or newlines in the scheme.
  let start = 0;
  while (start < url.length && url.charCodeAt(start) <= 0x20) start += 1;
  const normalized = url
    .slice(start)
    .replace(/[\t\n\r]/g, '')
    .toLowerCase();
  const colon = normalized.indexOf(':');
  return colon > 0 && SCRIPT_URL_SCHEMES.has(normalized.slice(0, colon));
}
