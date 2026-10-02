import Link from "next/link";
import { TaskFinder } from "@/components/home/task-finder";
import { getDocEntries } from "@/lib/doc-index";
import { releasesUrl } from "@/lib/links";

const INSTALL_URL = "/installation";
const FEATURED_SECTIONS = ["Get started", "Guides"];
const SUGGESTIONS = [
  "duplicates",
  "dead links",
  "import",
  "shortcuts",
  "API key",
];

/** Docs home: the two first actions, then the page finder. */
export function StartHere() {
  const entries = getDocEntries().filter((entry) => entry.url !== "/");

  return (
    <div className="not-prose">
      <div className="flex flex-wrap gap-3">
        <Link
          href={INSTALL_URL}
          className="inline-flex items-center rounded-lg bg-fd-primary px-4 py-2.5 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
        >
          Install Bookmark Scout
        </Link>
        <a
          href={releasesUrl}
          rel="noreferrer"
          className="inline-flex items-center rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 font-medium text-fd-foreground transition-colors hover:border-fd-primary"
        >
          Download the latest release
        </a>
      </div>
      <TaskFinder
        entries={entries}
        featuredSections={FEATURED_SECTIONS}
        suggestions={SUGGESTIONS}
      />
    </div>
  );
}
