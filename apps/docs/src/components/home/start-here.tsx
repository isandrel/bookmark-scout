import { site } from "@bookmark-scout/config";
import Link from "next/link";
import { TaskFinder } from "@/components/home/task-finder";
import { getCopy } from "@/lib/copy";
import { getDocEntries } from "@/lib/doc-index";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { source } from "@/lib/source";

/** The install page (content/docs/installation.mdx) and the first-run guide (first-save.mdx). */
const INSTALL_SLUGS = ["installation"];
const FIRST_SAVE_SLUGS = ["first-save"];

function requirePage(slugs: string[], locale: string) {
  const page = source.getPage(slugs, locale);
  if (!page) throw new Error(`Docs page /${slugs.join("/")} is missing`);
  return page;
}

/**
 * Docs home: add the extension from the first live store listing (the install page while no
 * store lists it), then the first-run guide, then the page finder, in the page's language.
 */
export function StartHere({ locale = DEFAULT_LOCALE }: { locale?: string }) {
  const copy = getCopy(locale);
  const home = source.getPage([], locale)?.url;
  const entries = getDocEntries(locale).filter((entry) => entry.url !== home);
  // Sections in sidebar order, from the `---Name---` separators in content/docs/meta.json.
  const sections = [...new Set(entries.map((entry) => entry.section))];
  const installPage = requirePage(INSTALL_SLUGS, locale);
  const firstSavePage = requirePage(FIRST_SAVE_SLUGS, locale);
  const store = site.stores.find((listing) => listing.live);

  return (
    <div className="not-prose">
      <div className="flex flex-wrap items-center gap-3">
        {store ? (
          <a
            href={store.url}
            rel="noreferrer"
            className="inline-flex items-center rounded-lg bg-fd-primary px-4 py-2.5 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            {copy.home.addTo(site.browsers.name(store.browser))}
          </a>
        ) : (
          <Link
            href={installPage.url}
            className="inline-flex items-center rounded-lg bg-fd-primary px-4 py-2.5 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            {copy.home.install(site.name)}
          </Link>
        )}
        <Link
          href={firstSavePage.url}
          className="inline-flex items-center rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 font-medium text-fd-foreground transition-colors hover:border-fd-primary"
        >
          {firstSavePage.data.title}
        </Link>
        {store ? (
          <Link
            href={installPage.url}
            className="px-1 text-sm text-fd-muted-foreground underline underline-offset-4 hover:text-fd-foreground"
          >
            {copy.home.otherBrowsers}
          </Link>
        ) : null}
      </div>
      <TaskFinder
        locale={locale}
        entries={entries}
        featuredSections={sections.slice(0, copy.home.featuredSectionCount)}
        suggestions={[...copy.home.suggestions]}
      />
    </div>
  );
}
