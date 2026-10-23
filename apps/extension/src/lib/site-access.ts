/**
 * Narrow website access for a run that requests a known set of bookmarks: the browser is asked
 * for those sites only, not all websites, as long as there are few enough of them
 * (config/network/site-access.toml).
 *
 * A site is a registrable domain with all its subdomains and both schemes (`*.example.com` over
 * http and https), so a redirect from `http://example.com` to `https://www.example.com`, or an
 * icon file on `static.example.com`, stays inside what was granted. Chrome words such a request
 * "Read and change your data on all example.com sites", Firefox "Access your data for sites in
 * the example.com domain". An IP address or a single-label name (`localhost`) is granted as
 * that host only, since it has no subdomains.
 */
import { z } from 'zod';

const config = readConfig(
  'network/site-access',
  z.strictObject({
    max_sites_per_request: z.number().int().positive(),
  }),
);

/** Sites above which a run asks for all websites instead. */
export const SITE_ACCESS_MAX_SITES = config.max_sites_per_request;

/** The web schemes a site is granted for; the manifest declares both as optional. */
const SITE_SCHEMES = ['http', 'https'] as const;
function isHostOnly(hostname: string): boolean {
  return (
    hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || !hostname.includes('.')
  );
}

/** The site a web URL belongs to (`example.com`, or the host itself), or null for other URLs. */
export function getUrlSite(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!SITE_SCHEMES.some((scheme) => parsed.protocol === `${scheme}:`)) return null;
  const hostname = getUrlHostname(url);
  if (!hostname) return null;
  return isHostOnly(hostname) ? hostname : getRegistrableDomain(hostname);
}

/** The distinct sites of the web URLs among `urls`, in first-seen order. */
export function getUrlSites(urls: Iterable<string>): string[] {
  const sites = new Set<string>();
  for (const url of urls) {
    const site = getUrlSite(url);
    if (site) sites.add(site);
  }
  return [...sites];
}

/** A site and how many of the counted URLs are on it. */
export type SiteCount = { site: string; count: number };

/**
 * The sites of the web URLs among `urls` with how many URLs each has, most first, then by name:
 * what a run that lets the user choose its sites lists before it starts.
 */
export function countUrlSites(urls: Iterable<string>): SiteCount[] {
  const counts = new Map<string, number>();
  for (const url of urls) {
    const site = getUrlSite(url);
    if (site) counts.set(site, (counts.get(site) ?? 0) + 1);
  }
  return [...counts]
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
}

/** A site as `getUrlSite` names it, such as one the user chose for a run. */
export const urlSiteSchema = z
  .string()
  .refine((site) => getUrlSite(`https://${site}/`) === site, 'Not a site name');

/**
 * The host patterns that grant `sites` (from `getUrlSites`), or null when there are more than
 * the configured limit and the run should ask for all websites.
 */
export function getSiteAccessOrigins(sites: readonly string[]): string[] | null {
  if (sites.length > SITE_ACCESS_MAX_SITES) return null;
  return sites.flatMap((site) => {
    const host = isHostOnly(site) ? site : `*.${site}`;
    return SITE_SCHEMES.map((scheme) => `${scheme}://${host}/*`);
  });
}

/** The host permission that stands for every website. */
const ALL_URLS = '<all_urls>';
/** A host permission pattern: its scheme and host, the path after them. */
const HOST_PATTERN = /^(\*|https?):\/\/([^/]+)\//;
const ANY_SUBDOMAIN = '*.';
const ANY_HOST = '*';

/**
 * Whether a web URL is inside a host permission pattern (one site's, such as
 * `https://*.example.com` with any path, every website's, or `<all_urls>`): its scheme and host;
 * site access is granted for whole sites, so the path is not compared.
 */
export function isUrlInOrigin(url: string, pattern: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const scheme = parsed.protocol.replace(/:$/, '');
  if (!SITE_SCHEMES.some((web) => web === scheme)) return false;
  if (pattern === ALL_URLS) return true;
  const match = HOST_PATTERN.exec(pattern);
  if (!match) return false;
  const [, patternScheme = '', patternHost = ''] = match;
  if (patternScheme !== ANY_HOST && patternScheme !== scheme) return false;
  // Firefox may name a port; a site is granted on every port.
  const host = patternHost.replace(/:\d+$/, '');
  if (host === ANY_HOST) return true;
  if (!host.startsWith(ANY_SUBDOMAIN)) return parsed.hostname === host;
  const domain = host.slice(ANY_SUBDOMAIN.length);
  return parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`);
}

/** A host name as a list of sites keeps it: lowercase labels of letters, digits, and hyphens. */
const SITE_NAME_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;
/** An address that names its scheme, as opposed to a bare host name. */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * A site the user typed or pasted (a host name, or an address on it) as a list of sites keeps it:
 * its host in lowercase, without `www.` or a trailing dot, in its ASCII form; undefined when it
 * names no host. Index Page Text's never-read sites are stored this way.
 */
export function toSiteName(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  let hostname: string;
  try {
    hostname = new URL(SCHEME_PREFIX.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return undefined;
  }
  const name = withoutWww(hostname.toLowerCase().replace(/\.$/, ''));
  return SITE_NAME_PATTERN.test(name) ? name : undefined;
}

/**
 * Whether `url` is on one of `sites` (from `toSiteName`) or a subdomain of one, as in
 * `news.example.com` on `example.com`.
 */
export function isUrlOnSites(url: string, sites: readonly string[]): boolean {
  if (sites.length === 0) return false;
  const host = withoutWww(getUrlHostname(url));
  return host !== '' && sites.some((site) => hostnameMatchesDomain(host, site));
}
