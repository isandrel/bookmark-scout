/**
 * Conflicts in the last run: under Smart Rules in Settings, the bookmarks the last reviewed run
 * found two rules disagreeing on (each would move it to another folder), with the folders they
 * named and a link that opens the manager on the bookmark's folder with Smart Rules ready to run
 * there (`rule-run-status.ts`). Shown once a run found one; the next run replaces the list.
 */
import { ExternalLink } from 'lucide-react';

/**
 * The manager on `folderId` with the Tools sidebar on Smart Rules (`MANAGER_RULES_HASH`), where a
 * run on that folder reviews the conflict.
 */
function reviewUrl(folderId: string): string {
  const query = new URLSearchParams({ [MANAGER_FOLDER_PARAM]: folderId });
  return browser.runtime.getURL(`${BOOKMARK_MANAGER_PATH}?${query}#${MANAGER_RULES_HASH}`);
}

export function RuleConflictList({ conflicts }: { conflicts: RuleRunStatuses['conflicts'] }) {
  if (!conflicts || conflicts.items.length === 0) return null;
  return (
    <section data-testid="rule-conflicts" className="mt-4 space-y-2">
      <div className="space-y-0.5">
        <h4 className="text-sm font-medium">{t('rules_conflictsTitle')}</h4>
        <p className="text-xs text-muted-foreground">
          {t('rules_conflictsDesc', formatDateTime(conflicts.at))}
        </p>
      </div>
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {conflicts.items.map((conflict) => {
          const title = getBookmarkDisplayTitle(conflict.title);
          const folders = t('rules_conflictFolders', formatList(conflict.paths));
          return (
            <li
              key={conflict.bookmarkId}
              data-testid="rule-conflict"
              className="flex items-center gap-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={title}>
                  {title}
                </p>
                <p className="truncate text-xs text-warning" title={folders}>
                  {folders}
                </p>
              </div>
              <a
                href={reviewUrl(conflict.parentId)}
                target="_blank"
                rel="noopener"
                aria-label={t('rules_conflictReviewLabel', title)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ExternalLink aria-hidden />
                {t('rules_conflictReview')}
              </a>
            </li>
          );
        })}
      </ul>
      {conflicts.more > 0 ? (
        <p className="text-xs text-muted-foreground">
          {tPlural('rules_conflictsMore', conflicts.more)}
        </p>
      ) : null}
    </section>
  );
}
