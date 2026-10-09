import type { ReactNode } from "react";
import { getCopy } from "@/lib/copy";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import {
  type ContactRole,
  contactAddress,
  contactHref,
  license,
  privacyEffectiveDate,
  type RepoTarget,
  releasesUrl,
  repoHref,
  type SitePath,
  siteUrl,
  storeAvailability,
  storeListing,
} from "@/lib/links";

/**
 * The page's language. MDX never sets it: the docs page binds it to every component that writes
 * text or links to the website (`localizedMdxComponents` in `src/mdx-components.tsx`).
 */
type Localized = { locale?: string };

/** A mailto link for one of the role addresses in config/project.toml. */
export function Contact({ role }: { role: ContactRole }) {
  return <a href={contactHref(role)}>{contactAddress(role)}</a>;
}

export function ReleaseLink({
  children,
  locale = DEFAULT_LOCALE,
}: Localized & { children?: ReactNode }) {
  return (
    <a href={releasesUrl} rel="noreferrer">
      {children ?? getCopy(locale).release.latest}
    </a>
  );
}

/** The project license name, linked to the license text. */
export function License() {
  return (
    <a href={license.url} rel="noreferrer">
      {license.name}
    </a>
  );
}

export function PrivacyEffectiveDate({ locale = DEFAULT_LOCALE }: Localized) {
  const date = privacyEffectiveDate(locale);
  return <time dateTime={date.iso}>{date.text}</time>;
}

/** A website page in the page's language. */
export function SiteLink({
  to,
  children,
  locale = DEFAULT_LOCALE,
}: Localized & {
  to: SitePath;
  children: ReactNode;
}) {
  return <a href={siteUrl(to, locale)}>{children}</a>;
}

/**
 * A link into the GitHub repository: `file` for a file and `tree` for a folder on the default
 * branch, `path` for any other page (such as `/issues`), and none for the repository itself.
 */
export function RepoLink({
  children,
  ...target
}: RepoTarget & { children: ReactNode }) {
  return (
    <a href={repoHref(target)} rel="noreferrer">
      {children}
    </a>
  );
}

/** States whether a store listing is live, and links to it only when it is. */
export function StoreListing({
  browser,
  locale = DEFAULT_LOCALE,
}: Localized & { browser: string }) {
  const listing = storeListing(browser, locale);
  if (!listing.live) return <p>{listing.text}</p>;
  return (
    <p>
      <a href={listing.url} rel="noreferrer">
        {listing.text}
      </a>
    </p>
  );
}

export function StoreAvailability({ locale = DEFAULT_LOCALE }: Localized) {
  const { text, links } = storeAvailability(locale);
  if (links.length === 0) return <p>{text}</p>;
  return (
    <>
      <p>{text}</p>
      <ul>
        {links.map((link) => (
          <li key={link.url}>
            <a href={link.url} rel="noreferrer">
              {link.name}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
