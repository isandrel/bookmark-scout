/**
 * The tile a card shows in its cover's room while the bookmark has no stored cover: the site's
 * icon and name on a tone of a color picked from the site's domain. It is drawn on this device
 * from the address alone, with no request and no permission. The tone's saturation and lightness
 * are theme tokens (`--cover-tile-*` in src/styles/theme.css), so light and dark themes each keep
 * the name readable; only the hue comes from the domain.
 */

/** The site a placeholder names: the address's host without `www.`, or '' without one. */
export function coverPlaceholderSite(url: string): string {
  return withoutWww(getUrlHostname(url));
}

/**
 * The hue of a placeholder, in degrees: from the registrable domain, so every page and subdomain
 * of a site shares it, and the same on every device and in every release.
 */
export function coverPlaceholderHue(url: string): number {
  return hashText32(getUrlDomain(url)) % DEGREES_PER_TURN;
}
