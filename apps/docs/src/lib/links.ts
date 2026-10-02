import {
  CONTACT,
  GITHUB_URL,
  LICENSE,
  PRIVACY_EFFECTIVE_DATE,
  RELEASES_URL,
  SITE_URL,
  STORES,
} from "@bookmark-scout/config";

export type ContactRole = keyof typeof CONTACT;
export type StoreBrowser = keyof typeof STORES;

/** Website routes the docs link to. Paths only; the origin comes from SITE_URL. */
export const SITE_PATHS = {
  home: "/",
  privacy: "/en/privacy/",
  support: "/en/support/",
} as const;

export type SitePath = keyof typeof SITE_PATHS;

export const STORE_NAMES: Record<StoreBrowser, string> = {
  chrome: "the Chrome Web Store",
  edge: "Microsoft Edge Add-ons",
  firefox: "Firefox Add-ons",
};

export function siteUrl(page: SitePath): string {
  return new URL(SITE_PATHS[page], SITE_URL).toString();
}

/** A path inside the GitHub repository, such as `/tree/main/store`. */
export function repoUrl(path = ""): string {
  return `${GITHUB_URL}${path}`;
}

export function contactAddress(role: ContactRole): string {
  return CONTACT[role];
}

export function contactHref(role: ContactRole): string {
  return `mailto:${CONTACT[role]}`;
}

export const releasesUrl = RELEASES_URL;

export const license = { name: LICENSE.name, url: LICENSE.url } as const;

/** The privacy policy's effective date: ISO 8601 from config, and written out in English. */
export const privacyEffectiveDate = {
  iso: PRIVACY_EFFECTIVE_DATE,
  text: new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${PRIVACY_EFFECTIVE_DATE}T00:00:00Z`)),
} as const;

export type StoreListing =
  | { live: true; url: string; text: string }
  | { live: false; text: string };

/** What to say about a browser's store listing, so pages never link to a listing that is not live. */
export function storeListing(browser: StoreBrowser): StoreListing {
  const url = STORES[browser];
  const store = STORE_NAMES[browser];
  if (url) {
    return { live: true, url, text: `Install Bookmark Scout from ${store}.` };
  }
  return {
    live: false,
    text: `Bookmark Scout is not on ${store} yet. Install it from a GitHub release:`,
  };
}

/** One sentence on which stores list the extension, derived from the STORES config. */
export function storeAvailability(): {
  text: string;
  links: { name: string; url: string }[];
} {
  const links = (Object.keys(STORES) as StoreBrowser[])
    .filter((browser) => STORES[browser])
    .map((browser) => ({ name: STORE_NAMES[browser], url: STORES[browser] }));
  if (links.length === 0) {
    return { text: "No browser store lists Bookmark Scout yet.", links };
  }
  return { text: "Bookmark Scout is listed on:", links };
}
