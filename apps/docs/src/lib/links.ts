import { type ContactRole, site } from "@bookmark-scout/config";
import { copy } from "@/lib/copy";

export type { ContactRole };

/** Website pages the docs link to, as routes of the site model. */
const SITE_PAGES = {
  home: () => site.url.home,
  privacy: () => site.url.page(site.locales.default, "/privacy"),
  support: () => site.url.page(site.locales.default, "/support"),
} as const;

export type SitePath = keyof typeof SITE_PAGES;

export function siteUrl(page: SitePath): string {
  return SITE_PAGES[page]();
}

/**
 * Where a `<RepoLink>` points: `file` is a file and `tree` a folder on the default branch,
 * `path` any other repository page (such as `/issues`); none of them is the repository itself.
 */
export type RepoTarget = { path?: string; file?: string; tree?: string };

export function repoHref({ path, file, tree }: RepoTarget = {}): string {
  if (file) return site.repo.file(file);
  if (tree) return site.repo.tree(tree);
  return site.repo.url(path);
}

export function contactAddress(role: ContactRole): string {
  return site.contact.address(role);
}

export function contactHref(role: ContactRole): string {
  return site.contact.mailto(role);
}

export const releasesUrl = site.repo.releasesLatest;

export const license = {
  name: site.license.spdx,
  url: site.license.fileUrl,
} as const;

/** The privacy policy's effective date: ISO 8601 from config, written out in the docs' language. */
export const privacyEffectiveDate = {
  iso: site.legal.privacyEffectiveDate,
  text: new Intl.DateTimeFormat(site.locales.default, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${site.legal.privacyEffectiveDate}T00:00:00Z`)),
} as const;

export type StoreListing =
  | { live: true; url: string; text: string }
  | { live: false; text: string };

/** What to say about a browser's store listing, so pages never link to a listing that is not live. */
export function storeListing(browser: string): StoreListing {
  const store = site.store(browser);
  return store.live
    ? {
        live: true,
        url: store.url,
        text: copy.store.listed(site.name, store.name),
      }
    : { live: false, text: copy.store.notListed(site.name, store.name) };
}

/** One sentence on which stores list the extension, derived from the store config. */
export function storeAvailability(): {
  text: string;
  links: { name: string; url: string }[];
} {
  const links = site.stores
    .filter((store) => store.live)
    .map((store) => ({ name: store.name, url: store.url }));
  return {
    text:
      links.length === 0
        ? copy.store.noneListed(site.name)
        : copy.store.listedOn(site.name),
    links,
  };
}
