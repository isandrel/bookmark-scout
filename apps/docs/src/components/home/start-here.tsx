import { site } from "@bookmark-scout/config";
import Link from "next/link";
import { TaskFinder } from "@/components/home/task-finder";
import { copy } from "@/lib/copy";
import { getDocEntries } from "@/lib/doc-index";
import { releasesUrl } from "@/lib/links";
import { source } from "@/lib/source";

/** The page the primary button opens (content/docs/installation.mdx). */
const INSTALL_SLUGS = ["installation"];

/** Docs home: the two first actions, then the page finder. */
export function StartHere() {
  const entries = getDocEntries().filter((entry) => entry.url !== "/");
  // Sections in sidebar order, from the `---Name---` separators in content/docs/meta.json.
  const sections = [...new Set(entries.map((entry) => entry.section))];
  const installPage = source.getPage(INSTALL_SLUGS);
  if (!installPage)
    throw new Error(`Docs page /${INSTALL_SLUGS.join("/")} is missing`);

  return (
    <div className="not-prose">
      <div className="flex flex-wrap gap-3">
        <Link
          href={installPage.url}
          className="inline-flex items-center rounded-lg bg-fd-primary px-4 py-2.5 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
        >
          {copy.home.install(site.name)}
        </Link>
        <a
          href={releasesUrl}
          rel="noreferrer"
          className="inline-flex items-center rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 font-medium text-fd-foreground transition-colors hover:border-fd-primary"
        >
          {copy.home.download}
        </a>
      </div>
      <TaskFinder
        entries={entries}
        featuredSections={sections.slice(0, copy.home.featuredSectionCount)}
        suggestions={[...copy.home.suggestions]}
      />
    </div>
  );
}
