import type { ReactNode } from "react";
import {
  type ContactRole,
  contactAddress,
  contactHref,
  license,
  privacyEffectiveDate,
  releasesUrl,
  repoUrl,
  type SitePath,
  type StoreBrowser,
  siteUrl,
  storeAvailability,
  storeListing,
} from "@/lib/links";

/** A mailto link for one of the role addresses in config/project.toml. */
export function Contact({ role }: { role: ContactRole }) {
  return <a href={contactHref(role)}>{contactAddress(role)}</a>;
}

export function ReleaseLink({ children }: { children?: ReactNode }) {
  return (
    <a href={releasesUrl} rel="noreferrer">
      {children ?? "the latest GitHub release"}
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

export function PrivacyEffectiveDate() {
  return (
    <time dateTime={privacyEffectiveDate.iso}>{privacyEffectiveDate.text}</time>
  );
}

export function SiteLink({
  to,
  children,
}: {
  to: SitePath;
  children: ReactNode;
}) {
  return <a href={siteUrl(to)}>{children}</a>;
}

/** A link into the GitHub repository; without `path` it links to the repository itself. */
export function RepoLink({
  path = "",
  children,
}: {
  path?: string;
  children: ReactNode;
}) {
  return (
    <a href={repoUrl(path)} rel="noreferrer">
      {children}
    </a>
  );
}

/** States whether a store listing is live, and links to it only when it is. */
export function StoreListing({ browser }: { browser: StoreBrowser }) {
  const listing = storeListing(browser);
  if (!listing.live) return <p>{listing.text}</p>;
  return (
    <p>
      <a href={listing.url} rel="noreferrer">
        {listing.text}
      </a>
    </p>
  );
}

export function StoreAvailability() {
  const { text, links } = storeAvailability();
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
