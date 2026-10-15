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
