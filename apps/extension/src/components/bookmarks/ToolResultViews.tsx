import { useMemo, useState } from 'react';

const HTTP_FAILURE_LABEL_KEYS: Partial<Record<DeadLinkCategory, string>> = {
  notFound: 'tools_deadLinkCategory_notFound',
  auth: 'tools_deadLinkCategory_auth',
  rateLimited: 'tools_deadLinkCategory_rateLimited',
  methodRejected: 'tools_deadLinkCategory_methodRejected',
  serverError: 'tools_deadLinkCategory_serverError',
  httpError: 'tools_deadLinkCategory_httpError',
};

/** Badge that separates confirmed dead links from failures that need a manual check. */
export function DeadLinkCategoryBadge({ item }: { item: DeadLinkResultItem }) {
  if (!item.category) return null;
  return isConfirmedDeadLink(item) ? (
    <Badge variant="destructive">{t('tools_deadLinkConfirmedDead')}</Badge>
  ) : (
    <Badge variant="outline">{t('tools_deadLinkNeedsCheck')}</Badge>
  );
}

/** Whether both URLs are on the same site (`getUrlSite`: the registrable domain). */
function isSameSite(url: string, otherUrl: string): boolean {
  const site = getUrlSite(url);
  return site !== null && site === getUrlSite(otherUrl);
}

/** The message naming where a redirect goes, as `$1`. */
function redirectMessageKey(item: DeadLinkResultItem & { redirectUrl: string }): MessageKey {
  return isSameSite(item.url, item.redirectUrl)
    ? 'qaManager_redirectSameSite'
    : 'tools_deadLinkRedirectsTo';
}

export function describeDeadLink(item: DeadLinkResultItem): string {
  switch (item.status) {
    case 'ok':
      return t('tools_deadLinkReachable');
    case 'redirect':
      if (!item.redirectUrl) return t('tools_deadLinkRedirected');
      return t(redirectMessageKey({ ...item, redirectUrl: item.redirectUrl }), item.redirectUrl);
    case 'timeout':
      return t('tools_deadLinkTimedOut');
    case 'invalid':
      return t('tools_deadLinkInvalidUrl');
    case 'skipped':
      return t('tools_notWebUrlSkipped');
    default: {
      if (item.statusCode !== undefined) {
        const status = t('tools_deadLinkHttpStatus', String(item.statusCode));
        const labelKey = item.category ? HTTP_FAILURE_LABEL_KEYS[item.category] : undefined;
        return labelKey ? t('tools_deadLinkHttpDetail', [status, t(labelKey)]) : status;
      }
      // Granted only this bookmark's site, the scan cannot see where the redirect goes: another
      // site, or a loop on the same one.
      if (item.category === 'redirectElsewhere') return t('qaManager_redirectUnfollowed');
      return item.errorKind === 'redirect' ? t('tools_redirectFailed') : t('tools_networkFailed');
    }
  }
}

/** `describeDeadLink`, with the address a redirect goes to as a link. */
export function DeadLinkDescription({ item }: { item: DeadLinkResultItem }) {
  const { redirectUrl } = item;
  if (item.status !== 'redirect' || !redirectUrl) return describeDeadLink(item);
  return (
    <RichMessage
      messageKey={redirectMessageKey({ ...item, redirectUrl })}
      values={[<UrlLink key="target" href={redirectUrl} data-slot="dead-link-redirect" />]}
    />
  );
}

const DEAD_LINK_GROUP_LABEL_KEYS = {
  dead: 'tools_deadLinkGroup_dead',
  check: 'tools_deadLinkGroup_check',
  redirect: 'tools_deadLinkGroup_redirect',
  ok: 'tools_deadLinkGroup_ok',
  skipped: 'tools_deadLinkGroup_skipped',
} as const satisfies Record<DeadLinkGroup, string>;

/** A dead-link category's tab text, with its count. */
export function deadLinkGroupLabel(group: DeadLinkGroup, count: number): string {
  return t(DEAD_LINK_GROUP_LABEL_KEYS[group], String(count));
}

function describeMetadata(item: MetadataFetchResultItem): string {
  switch (item.status) {
    case 'httpError':
      return t('tools_deadLinkHttpStatus', String(item.statusCode ?? 0));
    case 'timeout':
      return t('tools_deadLinkTimedOut');
    case 'error':
      return item.errorKind === 'redirect' ? t('tools_redirectFailed') : t('tools_networkFailed');
    case 'skipped':
      return t('tools_notWebUrlSkipped');
    case 'notHtml':
      return t('tools_metadataNotHtml');
    default:
      if (item.changed) return t('tools_metadataAvailable');
      return hasOtherPageTitle(item)
        ? t('qaManager_titleKept', t('settings_metadataFetcherOverwriteTitles'))
        : t('tools_metadataNoChange');
  }
}

/** A page title that differs from the bookmark's but is not offered (Overwrite Titles is off). */
function hasOtherPageTitle(item: MetadataFetchResultItem): boolean {
  return !item.changed && Boolean(item.suggestedTitle) && item.suggestedTitle !== item.title;
}

function describePrivacyFinding(finding: PrivacyFinding): string {
  switch (finding.kind) {
    case 'sensitiveParam':
      return t('tools_privacySensitiveParam', finding.param);
    case 'sensitiveFragmentParam':
      return t('tools_privacySensitiveFragmentParam', finding.param);
    case 'credentials':
      return finding.withPassword ? t('tools_privacyCredentials') : t('tools_privacyUsername');
    case 'tokenPattern':
      return t('tools_privacyTokenPattern');
    case 'email':
      return t('tools_privacyEmail');
    case 'uuid':
      return t('tools_privacyUuid');
  }
}

/** One reviewed bookmark: its title, optional badges, an optional control before it, details. */
export function ToolResultRow({
  title,
  badges,
  leading,
  children,
}: {
  title: string;
  badges?: React.ReactNode;
  /** A control such as a checkbox, shown before the details. */
  leading?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const details = (
    <>
      <div className="flex items-center justify-between gap-2">
        {/* Long unbroken titles wrap anywhere, so they never widen the dialog. */}
        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{title}</span>
        {badges ? <div className="flex flex-shrink-0 items-center gap-1">{badges}</div> : null}
      </div>
      {children}
    </>
  );
  return leading ? (
    <div data-slot="tool-result-row" className="flex min-w-0 gap-3 rounded-lg border p-3 text-sm">
      {leading}
      <div className="min-w-0 flex-1 space-y-2">{details}</div>
    </div>
  ) : (
    <div data-slot="tool-result-row" className="min-w-0 space-y-2 rounded-lg border p-3 text-sm">
      {details}
    </div>
  );
}

/** A secondary line of a result row, such as a URL or a status. */
function ResultLine({ children }: { children: React.ReactNode }) {
  return <div className="break-all text-xs text-muted-foreground">{children}</div>;
}

/** Shown in place of results when a scan found nothing. */
export function ToolEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/** The confirm button under a review, with an optional Cancel before it. */
export function ReviewFooter({
  label,
  busyLabel,
  busy,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  label: string;
  /** Shown while `busy`. */
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      {onCancel ? (
        <Button variant="outline" onClick={onCancel}>
          {t('action_cancel')}
        </Button>
      ) : null}
      <Button onClick={onConfirm} disabled={disabled || busy}>
        {busy ? busyLabel : label}
      </Button>
    </div>
  );
}

/**
 * The groups to remove from: in each, the bookmark to keep first, then the checked copies.
 * Groups with nothing checked are left out.
 */
function chosenDuplicateGroups(
  groups: readonly DuplicateGroup[],
  keeperOf: (group: DuplicateGroup) => string | undefined,
  removes: ReadonlySet<string>,
): DuplicateGroup[] {
  return groups.flatMap((group) => {
    const keeperId = keeperOf(group);
    const keeper = group.items.find((item) => item.node.id === keeperId);
    const extras = group.items.filter(
      (item) => item.node.id !== keeperId && removes.has(item.node.id),
    );
    return keeper && extras.length > 0 ? [{ ...group, items: [keeper, ...extras] }] : [];
  });
}

/**
 * Duplicate groups to review: one bookmark to keep in each (the first, until another is picked),
 * and a checkbox on every other copy, all checked at first. A group's address shows once in its
 * header; rows name their folder and date added, and their own address only when title-only
 * matching grouped different pages.
 */
export function DuplicateResultsView({
  result,
  isRemoving,
  onClose,
  onConfirm,
  notice,
  onUndo,
}: {
  result: DuplicateScanResult | null;
  isRemoving: boolean;
  onClose: () => void;
  onConfirm: (groups: DuplicateGroup[]) => void;
  /** Outcome of a partial removal, shown above the refreshed groups. */
  notice?: string;
  onUndo?: () => void;
}) {
  const groups = useMemo(() => result?.groups ?? [], [result]);
  const displayUrl = useDisplayUrl();
  // Picks belong to the groups they were made in, so a new scan starts from its first bookmarks.
  const [picked, setPicked] = useState({ groups, keepers: {} as Record<string, string> });
  const keepers = picked.groups === groups ? picked.keepers : {};
  const keeperOf = (group: DuplicateGroup) => keepers[group.key] ?? group.items[0]?.node.id;
  const firstExtras = useMemo(
    () => groups.flatMap((group) => group.items.slice(1).map((item) => item.node.id)),
    [groups],
  );
  const { selected, toggle, setMany } = useIdSelection(firstExtras);
  const extrasOf = (group: DuplicateGroup) =>
    group.items.map((item) => item.node.id).filter((id) => id !== keeperOf(group));
  const allExtras = groups.flatMap(extrasOf);
  const chosen = chosenDuplicateGroups(groups, keeperOf, selected);
  const removing = chosen.reduce((count, group) => count + group.items.length - 1, 0);
  const checkState = (ids: readonly string[]) => {
    const checked = ids.filter((id) => selected.has(id)).length;
    return {
      checked: checked > 0 && checked === ids.length,
      indeterminate: checked > 0 && checked < ids.length,
    };
  };
  const keep = (group: DuplicateGroup, id: string) => {
    const previous = keeperOf(group);
    setPicked({ groups, keepers: { ...keepers, [group.key]: id } });
    // The new keeper is never removed; the old one becomes a copy, removed like the others.
    setMany([id], false);
    if (previous) setMany([previous], true);
  };

  // Title-only matching can group bookmarks that point to different pages; removing the
  // extras would then delete those pages, so say so before the user confirms.
  const mixedUrlKeys = new Set(
    result?.match.strategy === 'title_only'
      ? groups
          .filter((group) => new Set(group.items.map((item) => item.node.url)).size > 1)
          .map((group) => group.key)
      : [],
  );
  return (
    <div className="space-y-4">
      {mixedUrlKeys.size > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-wash p-3 text-sm text-warning"
        >
          {tPlural('tools_duplicatesTitleOnlyWarning', mixedUrlKeys.size)}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm"
        >
          <span>{notice}</span>
          {onUndo ? (
            <Button variant="outline" size="sm" onClick={onUndo}>
              {t('action_undo')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {groups.length ? (
        <>
          <div
            data-testid="duplicate-selection"
            className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs"
          >
            <Checkbox
              {...checkState(allExtras)}
              onCheckedChange={(checked) => setMany(allExtras, checked === true)}
              aria-label={t('tools_duplicatesSelectAll')}
              disabled={isRemoving}
            />
            <span className="text-muted-foreground">{t('tools_duplicatesHint')}</span>
          </div>
          {groups.map((group) => {
            const keeperId = keeperOf(group);
            const mixed = mixedUrlKeys.has(group.key);
            const extras = extrasOf(group);
            return (
              <section
                key={group.key}
                data-slot="duplicate-group"
                className="min-w-0 overflow-hidden rounded-lg border"
              >
                <div className="flex min-w-0 items-center gap-2 bg-muted/40 px-3 py-2">
                  <Checkbox
                    {...checkState(extras)}
                    onCheckedChange={(checked) => setMany(extras, checked === true)}
                    aria-label={t('tools_duplicatesSelectGroup', group.label)}
                    disabled={isRemoving}
                  />
                  <Badge variant="secondary">{group.items.length}</Badge>
                  <code className="min-w-0 truncate text-xs text-muted-foreground">
                    {displayUrl(group.label)}
                  </code>
                  {mixed ? (
                    <Badge variant="outline">{t('tools_duplicatesDifferentUrls')}</Badge>
                  ) : null}
                </div>
                <RadioGroup
                  value={keeperId}
                  onValueChange={(value) => keep(group, String(value))}
                  aria-label={t('tools_duplicatesKeepLabel', group.label)}
                  disabled={isRemoving}
                >
                  {group.items.map((item) => {
                    const title = getBookmarkDisplayTitle(item.node.title);
                    const isKeeper = item.node.id === keeperId;
                    return (
                      <div
                        key={item.node.id}
                        data-slot="duplicate-item"
                        data-keep={isKeeper || undefined}
                        className="flex min-w-0 items-center gap-3 border-t px-3 py-2 text-sm data-keep:bg-accent/40"
                      >
                        <RadioGroupItem
                          value={item.node.id}
                          aria-label={t('tools_duplicatesKeepItem', title)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              data-slot="tool-result-title"
                              className="min-w-0 truncate font-medium"
                              title={title}
                            >
                              {title}
                            </span>
                            {isKeeper ? <Badge>{t('state_keep')}</Badge> : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.pathLabel || t('tools_rootFolder')}
                            {item.node.dateAdded === undefined
                              ? null
                              : ` · ${formatDateTime(item.node.dateAdded)}`}
                          </p>
                          {mixed ? (
                            <p className="truncate text-xs text-muted-foreground">
                              <UrlLink href={item.node.url ?? ''} />
                            </p>
                          ) : null}
                        </div>
                        {isKeeper ? null : (
                          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox
                              checked={selected.has(item.node.id)}
                              onCheckedChange={(checked) => toggle(item.node.id, checked === true)}
                              aria-label={t('tools_duplicatesRemoveItem', title)}
                              disabled={isRemoving}
                            />
                            <span aria-hidden="true">{t('tools_duplicatesRemove')}</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </RadioGroup>
              </section>
            );
          })}
        </>
      ) : (
        <ToolEmptyState message={t('state_noDuplicatesFound')} />
      )}

      <ReviewFooter
        label={tPlural('tools_duplicatesRemoveSelected', removing)}
        busyLabel={t('action_removing')}
        busy={isRemoving}
        disabled={removing === 0}
        onConfirm={() => onConfirm(chosen)}
        onCancel={onClose}
      />
    </div>
  );
}

type UrlCleanerAction = 'clean' | 'keep';
const URL_CLEANER_ACTIONS = ['clean', 'keep'] as const satisfies readonly UrlCleanerAction[];

/** A URL Cleaner review category: the Remove Parameters entry, a repeated parameter, or a fragment. */
function urlCleanerCategory(reason: UrlCleanerReason): string {
  return reason.kind === 'pattern' ? `${URL_CLEANER_PATTERN_PREFIX}${reason.pattern}` : reason.kind;
}
/** Marks a category named after a Remove Parameters entry, so no entry is taken for another kind. */
const URL_CLEANER_PATTERN_PREFIX = 'pattern:';

function urlCleanerCategoryLabel(category: string, count: number): string {
  if (category.startsWith(URL_CLEANER_PATTERN_PREFIX)) {
    return t('review_categoryNamed', [
      category.slice(URL_CLEANER_PATTERN_PREFIX.length),
      String(count),
    ]);
  }
  return category === 'duplicate'
    ? t('tools_urlCleanerCategoryDuplicate', String(count))
    : t('tools_urlCleanerCategoryFragment', String(count));
}

/**
 * URL Cleaner's review: each URL, by the rule that cleans it, starting on Clean (or Keep as is,
 * as `[defaults] url_cleaner` says), with batch actions; only the URLs left on Clean change.
 */
export function UrlCleanerResultsView({
  result,
  isApplying,
  onClose,
  onConfirm,
}: {
  result: UrlCleanerResult | null;
  isApplying: boolean;
  onClose: () => void;
  onConfirm: (previews: UrlCleanerPreview[]) => void;
}) {
  const previews = useMemo(() => result?.previews ?? [], [result]);
  const categories = useMemo(
    () => [...new Set(previews.map((preview) => urlCleanerCategory(preview.reason)))],
    [previews],
  );
  const { actionOf, setAction, chosen } = useReviewChoices<UrlCleanerPreview, UrlCleanerAction>(
    previews,
    (preview) => preview.id,
    () => REVIEW_DEFAULT_ACTIONS.url_cleaner,
  );
  const cleaned = chosen('clean');
  return (
    <div className="space-y-4">
      {previews.length ? (
        <ReviewList
          items={previews}
          idOf={(preview) => preview.id}
          categories={categories}
          categoryOf={(preview) => urlCleanerCategory(preview.reason)}
          categoryLabel={urlCleanerCategoryLabel}
          actionsOf={() => URL_CLEANER_ACTIONS}
          actionLabel={(action) =>
            action === 'clean'
              ? t('tools_urlCleanerActionClean')
              : t(DEAD_LINK_REPAIR_CHOICE_LABEL_KEYS.keep)
          }
          batchActions={URL_CLEANER_ACTIONS}
          actionOf={actionOf}
          onAction={setAction}
          titleOf={(preview) => getBookmarkDisplayTitle(preview.title)}
          disabled={isApplying}
          rowTestId="url-cleaner-item"
          renderDetails={(preview) => (
            <>
              <p className="truncate text-xs text-muted-foreground line-through">
                <UrlLink href={preview.originalUrl} />
              </p>
              <p className="truncate text-xs text-success">
                <UrlLink href={preview.cleanedUrl} />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[preview.folderPath || t('tools_rootFolder'), ...preview.removedParams].join(
                  ' · ',
                )}
              </p>
            </>
          )}
        />
      ) : (
        <ToolEmptyState message={t('state_noUrlChangesFound')} />
      )}

      <ReviewFooter
        label={tPlural('tools_urlCleanerApplySelected', cleaned.length)}
        busyLabel={t('action_applying')}
        busy={isApplying}
        disabled={cleaned.length === 0}
        onConfirm={() => onConfirm(cleaned)}
        onCancel={onClose}
      />
    </div>
  );
}
export function StatisticsResultsView({ result }: { result: BookmarkStatistics | null }) {
  if (!result) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard label={t('stats_totalBookmarks')} value={result.totalBookmarks} />
      <StatCard label={t('stats_totalFolders')} value={result.totalFolders} />
      <StatCard label={t('stats_deepestLevel')} value={result.deepestLevel} />
      {result.duplicateCount !== undefined ? (
        <StatCard label={t('stats_duplicates')} value={result.duplicateCount} />
      ) : null}
      {result.topDomains ? (
        <StatList label={t('stats_topDomains')} items={result.topDomains} />
      ) : null}
      {result.topFolders ? (
        <StatList label={t('stats_topFolders')} items={result.topFolders} />
      ) : null}
      {result.protocols ? <StatList label={t('stats_protocols')} items={result.protocols} /> : null}
      {result.depthBreakdown ? (
        <StatList
          label={t('stats_depthBreakdown')}
          items={result.depthBreakdown.map((entry) => ({
            label: t('stats_depthLevel', String(entry.level)),
            count: entry.count,
          }))}
        />
      ) : null}
    </div>
  );
}

export function DeadLinkResultsView({
  result,
  onReview,
}: {
  result: DeadLinkScanResult | null;
  /** Opens the reviewed repair workflow for failed and redirected links. */
  onReview?: () => void;
}) {
  const [group, setGroup] = useState<CategoryFilter<DeadLinkGroup>>(ALL_CATEGORIES);
  const items = result?.items ?? [];
  const count = (wanted: DeadLinkGroup) =>
    items.filter((item) => deadLinkGroup(item) === wanted).length;
  const repairable = items.filter(isDeadLinkRepairCandidate).length;
  return result?.items.length ? (
    <div className="space-y-3">
      <div
        data-testid="dead-link-summary"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"
      >
        <span>
          {t('tools_deadLinkSummary', [
            String(count('dead')),
            String(count('check')),
            String(count('redirect')),
          ])}
        </span>
        {onReview && repairable > 0 ? (
          <Button size="sm" onClick={onReview}>
            {t('tools_deadLinkReview')}
          </Button>
        ) : null}
      </div>
      <CategoryTabs
        items={items}
        categories={DEAD_LINK_GROUPS}
        categoryOf={deadLinkGroup}
        categoryLabel={deadLinkGroupLabel}
        value={group}
        onValueChange={setGroup}
      />
      {inCategory(items, group, deadLinkGroup).map((item) => (
        <ToolResultRow
          key={item.id}
          title={getBookmarkDisplayTitle(item.title)}
          badges={
            <>
              <DeadLinkCategoryBadge item={item} />
              <Badge
                variant={
                  item.status === 'ok' || item.status === 'skipped' ? 'secondary' : 'destructive'
                }
              >
                {t(`tools_deadLinkStatus_${item.status}`)}
              </Badge>
            </>
          }
        >
          <ResultLine>
            <UrlLink href={item.url} />
          </ResultLine>
          <ResultLine>
            <DeadLinkDescription item={item} />
          </ResultLine>
        </ToolResultRow>
      ))}
    </div>
  ) : (
    <ToolEmptyState message={t('state_noDeadLinksFound')} />
  );
}

const METADATA_CATEGORIES = ['title', 'same', 'failed', 'notHtml', 'skipped'] as const;
type MetadataCategory = (typeof METADATA_CATEGORIES)[number];
type MetadataAction = 'apply' | 'skip';

const METADATA_CATEGORY_LABEL_KEYS = {
  title: 'tools_metadataCategory_title',
  same: 'tools_metadataCategory_same',
  failed: 'tools_metadataCategory_failed',
  notHtml: 'tools_metadataCategory_notHtml',
  skipped: 'tools_metadataCategory_skipped',
} as const satisfies Record<MetadataCategory, string>;

/** Whether the fetch found a title the bookmark can take. */
function canApplyTitle(item: MetadataFetchResultItem): boolean {
  return item.changed && Boolean(item.suggestedTitle);
}

function metadataCategory(item: MetadataFetchResultItem): MetadataCategory {
  if (canApplyTitle(item)) return 'title';
  switch (item.status) {
    case 'ok':
      return 'same';
    case 'notHtml':
    case 'skipped':
      return item.status;
    default:
      return 'failed';
  }
}

/**
 * Metadata Fetcher's review: each bookmark by what the fetch found, a new title starting on Use
 * page title (or Keep as is, as `[defaults] metadata_fetcher` says), with batch actions; only the
 * titles left on Use page title change.
 */
export function MetadataResultsView({
  result,
  isApplying,
  onApply,
}: {
  result: MetadataFetchResult | null;
  isApplying: boolean;
  onApply: (items: MetadataFetchResultItem[]) => void;
}) {
  const items = useMemo(() => result?.items ?? [], [result]);
  const { actionOf, setAction, chosen } = useReviewChoices<MetadataFetchResultItem, MetadataAction>(
    items,
    (item) => item.id,
    (item) => (canApplyTitle(item) ? REVIEW_DEFAULT_ACTIONS.metadata_fetcher : 'skip'),
  );
  const applied = chosen('apply');

  if (!items.length) {
    return <ToolEmptyState message={t('state_noMetadataFound')} />;
  }

  return (
    <div className="space-y-4">
      <ReviewList
        items={items}
        idOf={(item) => item.id}
        categories={METADATA_CATEGORIES}
        categoryOf={metadataCategory}
        categoryLabel={(category, count) =>
          t(METADATA_CATEGORY_LABEL_KEYS[category], String(count))
        }
        actionsOf={(item) =>
          canApplyTitle(item) ? (['apply', 'skip'] as const) : (['skip'] as const)
        }
        actionLabel={(action) =>
          action === 'apply'
            ? t('tools_metadataActionApply')
            : t(DEAD_LINK_REPAIR_CHOICE_LABEL_KEYS.keep)
        }
        batchActions={['apply', 'skip'] as const}
        actionOf={actionOf}
        onAction={setAction}
        titleOf={(item) => getBookmarkDisplayTitle(item.title)}
        disabled={isApplying}
        rowTestId="metadata-item"
        renderDetails={(item) => (
          <>
            <p className="truncate text-xs text-muted-foreground">
              <UrlLink href={item.url} />
            </p>
            {item.status === 'ok' && canApplyTitle(item) ? (
              <p className="text-xs">{t('tools_suggestedTitle', item.suggestedTitle)}</p>
            ) : null}
            {item.status === 'ok' && hasOtherPageTitle(item) ? (
              <p className="text-xs text-muted-foreground">
                {t('qaManager_pageTitle', item.suggestedTitle)}
              </p>
            ) : null}
            {item.status === 'ok' && item.description ? (
              <p className="truncate text-xs text-muted-foreground">{item.description}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{describeMetadata(item)}</p>
          </>
        )}
      />
      <ReviewFooter
        label={tPlural('tools_metadataApplySelected', applied.length)}
        busyLabel={t('action_applying')}
        busy={isApplying}
        disabled={applied.length === 0}
        onConfirm={() => onApply(applied)}
      />
    </div>
  );
}
/** Refresh Site Icons' review tabs, in order, by what the refresh found for a site. */
const SITE_ICON_CATEGORIES = ['updated', 'unchanged', 'noIcon', 'failed'] as const;

const SITE_ICON_CATEGORY_LABEL_KEYS = {
  updated: 'tools_siteIconCategory_updated',
  unchanged: 'tools_siteIconCategory_unchanged',
  noIcon: 'tools_siteIconCategory_noIcon',
  failed: 'tools_siteIconCategory_failed',
} as const satisfies Record<SiteIconResultItem['status'], string>;

type SiteIconAction = (typeof REVIEW_DEFAULT_ACTIONS)['site_icons'];
const SITE_ICON_ACTIONS = ['save', 'skip'] as const satisfies readonly SiteIconAction[];

/** Whether the refresh found an icon the site can keep. */
function canSaveSiteIcon(item: SiteIconResultItem): boolean {
  return Boolean(item.icon) && (item.status === 'updated' || item.status === 'unchanged');
}

function describeSiteIcon(item: SiteIconResultItem): string {
  switch (item.status) {
    case 'updated':
      return t('tools_siteIconsNewFrom', item.iconUrl ?? '');
    case 'unchanged':
      return t('tools_siteIconsUnchanged');
    case 'noIcon':
      if (item.rejection === 'tooLarge') return t('tools_siteIconsTooLarge');
      if (item.rejection === 'notImage') return t('tools_siteIconsNotImage');
      return t('tools_siteIconsNotFound');
    default:
      if (item.errorKind === 'timeout') return t('tools_deadLinkTimedOut');
      return item.errorKind === 'redirect' ? t('tools_redirectFailed') : t('tools_networkFailed');
  }
}

/**
 * Refresh Site Icons' review: each site by what the refresh found, an icon found starting on Save
 * (or Skip, as `[defaults] site_icons` says), with batch actions; only the icons left on Save
 * are kept.
 */
export function SiteIconResultsView({
  result,
  isSaving,
  onSave,
}: {
  result: SiteIconRefreshResult | null;
  isSaving: boolean;
  onSave: (items: SiteIconResultItem[]) => void;
}) {
  const items = useMemo(() => result?.items ?? [], [result]);
  const { actionOf, setAction, chosen } = useReviewChoices<SiteIconResultItem, SiteIconAction>(
    items,
    (item) => item.origin,
    (item) => (canSaveSiteIcon(item) ? REVIEW_DEFAULT_ACTIONS.site_icons : 'skip'),
  );
  const saved = chosen('save');

  if (!result || (result.items.length === 0 && result.skippedBookmarks === 0)) {
    return <ToolEmptyState message={t('state_noSiteIconsFound')} />;
  }

  return (
    <div className="space-y-4">
      {result.skippedBookmarks > 0 ? (
        <p className="text-xs text-muted-foreground">
          {tPlural('tools_siteIconsSkippedDesc', result.skippedBookmarks)}
        </p>
      ) : null}
      <ReviewList
        items={items}
        idOf={(item) => item.origin}
        categories={SITE_ICON_CATEGORIES}
        categoryOf={(item) => item.status}
        categoryLabel={(category, count) =>
          t(SITE_ICON_CATEGORY_LABEL_KEYS[category], String(count))
        }
        actionsOf={(item) => (canSaveSiteIcon(item) ? SITE_ICON_ACTIONS : (['skip'] as const))}
        actionLabel={(action) =>
          action === 'save' ? t('tools_siteIconsActionSave') : t('tools_reviewActionSkip')
        }
        batchActions={SITE_ICON_ACTIONS}
        actionOf={actionOf}
        onAction={setAction}
        titleOf={(item) => item.origin}
        disabled={isSaving}
        rowTestId="site-icon-item"
        renderBadges={(item) =>
          item.icon ? (
            <img src={item.icon} alt="" width={16} height={16} className="size-4 shrink-0" />
          ) : null
        }
        renderDetails={(item) => (
          <>
            <p className="truncate text-xs text-muted-foreground">
              {[
                tPlural('tools_siteIconsBookmarkCount', item.bookmarkCount),
                describeSiteIcon(item),
              ].join(' · ')}
            </p>
            {item.keepsCachedIcon && (item.status === 'failed' || item.status === 'noIcon') ? (
              <p className="text-xs text-muted-foreground">{t('tools_siteIconsKeptCached')}</p>
            ) : null}
          </>
        )}
      />
      <ReviewFooter
        label={tPlural('tools_siteIconsSave', saved.length)}
        busyLabel={t('action_saving')}
        busy={isSaving}
        disabled={saved.length === 0}
        onConfirm={() => onSave(saved)}
      />
    </div>
  );
}

/** Privacy Scanner's review tabs, most severe first. */
const PRIVACY_CATEGORIES = ['high', 'medium', 'low'] as const;

const PRIVACY_CATEGORY_LABEL_KEYS = {
  high: 'tools_privacyCategory_high',
  medium: 'tools_privacyCategory_medium',
  low: 'tools_privacyCategory_low',
} as const satisfies Record<PrivacySeverity, string>;

type PrivacyAction = (typeof REVIEW_DEFAULT_ACTIONS)['privacy_scanner'];
const PRIVACY_ACTIONS = ['keep', 'delete'] as const satisfies readonly PrivacyAction[];

/**
 * Privacy Scanner's review: each flagged bookmark by how sensitive it is, starting on Keep as is
 * (or Delete, as `[defaults] privacy_scanner` says), with batch actions; only the bookmarks left
 * on Delete are deleted, with undo.
 */
export function PrivacyResultsView({
  result,
  isApplying,
  onDelete,
}: {
  result: PrivacyScanResult | null;
  isApplying: boolean;
  onDelete: (items: PrivacyScanItem[]) => void;
}) {
  const items = useMemo(() => result?.items ?? [], [result]);
  const { actionOf, setAction, chosen } = useReviewChoices<PrivacyScanItem, PrivacyAction>(
    items,
    (item) => item.id,
    () => REVIEW_DEFAULT_ACTIONS.privacy_scanner,
  );
  const deleted = chosen('delete');

  if (!items.length) return <ToolEmptyState message={t('state_noPrivacyIssuesFound')} />;

  return (
    <div className="space-y-4">
      <ReviewList
        items={items}
        idOf={(item) => item.id}
        categories={PRIVACY_CATEGORIES}
        categoryOf={(item) => item.severity}
        categoryLabel={(category, count) => t(PRIVACY_CATEGORY_LABEL_KEYS[category], String(count))}
        actionsOf={() => PRIVACY_ACTIONS}
        actionLabel={(action) => t(DEAD_LINK_REPAIR_CHOICE_LABEL_KEYS[action])}
        batchActions={PRIVACY_ACTIONS}
        actionOf={actionOf}
        onAction={setAction}
        titleOf={(item) => getBookmarkDisplayTitle(item.title)}
        disabled={isApplying}
        rowTestId="privacy-item"
        renderBadges={(item) => (
          <Badge variant={item.severity === 'high' ? 'destructive' : 'outline'}>
            {t(`tools_privacySeverity_${item.severity}`)}
          </Badge>
        )}
        renderDetails={(item) => (
          <>
            <p className="truncate text-xs text-muted-foreground">
              <UrlLink href={item.url} />
            </p>
            <p className="text-xs text-muted-foreground">
              {item.findings.map(describePrivacyFinding).join(' · ')}
            </p>
          </>
        )}
      />
      <ReviewFooter
        label={tPlural('tools_privacyDeleteSelected', deleted.length)}
        busyLabel={t('action_applying')}
        busy={isApplying}
        disabled={deleted.length === 0}
        onConfirm={() => onDelete(deleted)}
      />
    </div>
  );
}

/** A tag or summary suggestion for one bookmark; which fields are set depends on the tool. */
type AIMetadataSuggestion = {
  bookmarkId: string;
  title: string;
  url: string;
  tags?: string[];
  reason?: string;
  summary?: string;
};

/** Suggested tags (Auto-Tagging) or summaries (Summarizer), saved together after review. */
/** Auto-Tagging's and Summarizer's review has one tab: every suggestion. */
const AI_METADATA_CATEGORIES = ['suggestions'] as const;

type AIMetadataAction = (typeof REVIEW_DEFAULT_ACTIONS)['ai_metadata'];
const AI_METADATA_ACTIONS = ['save', 'skip'] as const satisfies readonly AIMetadataAction[];

/**
 * Auto-Tagging's and Summarizer's review: each suggestion starting on Save (or Skip, as
 * `[defaults] ai_metadata` says), with batch actions; only the suggestions left on Save are saved.
 */
export function AIMetadataResultsView<Item extends AIMetadataSuggestion>({
  items,
  saveLabel,
  isSaving,
  onSave,
}: {
  items: readonly Item[];
  /** The save button's text for how many suggestions are left on Save. */
  saveLabel: (count: number) => string;
  isSaving: boolean;
  onSave: (items: Item[]) => void;
}) {
  const { actionOf, setAction, chosen } = useReviewChoices<Item, AIMetadataAction>(
    items,
    (item) => item.bookmarkId,
    () => REVIEW_DEFAULT_ACTIONS.ai_metadata,
  );
  const saved = chosen('save');

  if (!items.length) return <ToolEmptyState message={t('state_noAiResults')} />;
  return (
    <div className="space-y-4">
      <ReviewList
        items={items}
        idOf={(item) => item.bookmarkId}
        categories={AI_METADATA_CATEGORIES}
        categoryOf={() => 'suggestions'}
        categoryLabel={(_category, count) =>
          t('tools_aiMetadataCategory_suggestions', String(count))
        }
        actionsOf={() => AI_METADATA_ACTIONS}
        actionLabel={(action) =>
          action === 'save' ? t('tools_aiMetadataActionSave') : t('tools_reviewActionSkip')
        }
        batchActions={AI_METADATA_ACTIONS}
        actionOf={actionOf}
        onAction={setAction}
        titleOf={(item) => getBookmarkDisplayTitle(item.title)}
        disabled={isSaving}
        rowTestId="ai-metadata-item"
        renderDetails={(item) => (
          <>
            <p className="truncate text-xs text-muted-foreground">
              <UrlLink href={item.url} />
            </p>
            {item.tags ? (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
            {item.summary !== undefined ? <p className="text-xs">{item.summary}</p> : null}
            {item.reason !== undefined ? (
              <p className="text-xs text-muted-foreground">{item.reason}</p>
            ) : null}
          </>
        )}
      />
      <ReviewFooter
        label={saveLabel(saved.length)}
        busyLabel={t('action_saving')}
        busy={isSaving}
        disabled={saved.length === 0}
        onConfirm={() => onSave(saved)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatList({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-lg border p-4 sm:col-span-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={`${label}-${item.label}`}
              className="flex items-center justify-between text-sm"
            >
              <span className="truncate pr-4">{item.label || t('tools_rootFolder')}</span>
              <Badge variant="secondary">{item.count}</Badge>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">{t('state_noData')}</div>
        )}
      </div>
    </div>
  );
}

/** Smart Rules' review tabs, by what the rules would do to a bookmark. */
const RULE_CATEGORIES = ['change', 'conflict', 'blocked', 'satisfied'] as const;
type RuleCategory = (typeof RULE_CATEGORIES)[number];

const RULE_CATEGORY_LABEL_KEYS = {
  change: 'tools_rulesCategory_change',
  conflict: 'tools_rulesCategory_conflict',
  blocked: 'tools_rulesCategory_blocked',
  satisfied: 'tools_rulesCategory_satisfied',
} as const satisfies Record<RuleCategory, string>;

const RULE_BLOCK_KEYS = {
  missingFolder: 'tools_rulesBlocked_missingFolder',
  managed: 'tools_rulesBlocked_managed',
} as const satisfies Record<RuleMoveBlock, string>;

type RuleAction = (typeof REVIEW_DEFAULT_ACTIONS)['bookmark_rules'];
const RULE_ACTIONS = ['apply', 'skip'] as const satisfies readonly RuleAction[];

function ruleCategory(item: RulePlanItem): RuleCategory {
  if (item.blocked) return 'blocked';
  if (item.conflicts.length > 0) return 'conflict';
  return changesBookmark(item) ? 'change' : 'satisfied';
}

/**
 * Smart Rules' review: each bookmark the rules match, by what they would do, starting on Apply
 * (or Skip, as `[defaults] bookmark_rules` says) when it changes something; one two rules would
 * move to different folders starts on Skip. Only the bookmarks left on Apply change.
 */
export function RulesResultsView({
  items,
  ruleNames,
  isApplying,
  onApply,
}: {
  items: readonly RulePlanItem[];
  /** Each rule's name, by id. */
  ruleNames: ReadonlyMap<string, string>;
  isApplying: boolean;
  onApply: (items: RulePlanItem[]) => void;
}) {
  const { actionOf, setAction, chosen } = useReviewChoices<RulePlanItem, RuleAction>(
    items,
    (item) => item.id,
    (item) => (ruleCategory(item) === 'change' ? REVIEW_DEFAULT_ACTIONS.bookmark_rules : 'skip'),
  );
  const applied = chosen('apply');

  if (!items.length) return <ToolEmptyState message={t('tools_rulesNoRules')} />;
  return (
    <div className="space-y-4">
      <ReviewList
        items={items}
        idOf={(item) => item.id}
        categories={RULE_CATEGORIES}
        categoryOf={ruleCategory}
        categoryLabel={(category, count) => t(RULE_CATEGORY_LABEL_KEYS[category], String(count))}
        actionsOf={(item) => (changesBookmark(item) ? RULE_ACTIONS : (['skip'] as const))}
        actionLabel={(action) =>
          action === 'apply' ? t('tools_rulesActionApply') : t('tools_reviewActionSkip')
        }
        batchActions={RULE_ACTIONS}
        actionOf={actionOf}
        onAction={setAction}
        titleOf={(item) => getBookmarkDisplayTitle(item.title)}
        disabled={isApplying}
        rowTestId="rule-item"
        renderDetails={(item) => (
          <>
            <p className="truncate text-xs text-muted-foreground">
              <UrlLink href={item.url} />
            </p>
            {item.addTags.length > 0 ? (
              <p className="text-xs">{t('tools_rulesAddTags', formatList(item.addTags))}</p>
            ) : null}
            {item.move ? <p className="text-xs">{t('tools_rulesMoveTo', item.move.path)}</p> : null}
            {item.conflicts.map((conflict) => (
              <p key={conflict.ruleId} className="text-xs text-warning">
                {t('tools_rulesConflict', conflict.path)}
              </p>
            ))}
            {item.blocked ? (
              <p className="text-xs text-warning">{t(RULE_BLOCK_KEYS[item.blocked])}</p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {[
                item.folderPath || t('tools_rootFolder'),
                t(
                  'tools_rulesMatchedBy',
                  formatList(item.ruleIds.map((id) => ruleNames.get(id) ?? id)),
                ),
              ].join(t('format_separator'))}
            </p>
          </>
        )}
      />
      <ReviewFooter
        label={tPlural('tools_rulesApplySelected', applied.length)}
        busyLabel={t('action_applying')}
        busy={isApplying}
        disabled={applied.length === 0}
        onConfirm={() => onApply(applied)}
/** Index Page Text's review tabs, by what reading the page found. */
const PAGE_TEXT_CATEGORIES = ['read', 'empty', 'failed', 'current', 'skipped'] as const;

const PAGE_TEXT_CATEGORY_LABEL_KEYS = {
  read: 'tools_pageTextCategory_read',
  empty: 'tools_pageTextCategory_empty',
  failed: 'tools_pageTextCategory_failed',
  current: 'tools_pageTextCategory_current',
  skipped: 'tools_pageTextCategory_skipped',
} as const satisfies Record<PageTextScanStatus, string>;

type PageTextAction = (typeof REVIEW_DEFAULT_ACTIONS)['page_text'];
const PAGE_TEXT_ACTIONS = ['save', 'skip'] as const satisfies readonly PageTextAction[];

/**
 * Index Page Text's review: each page by what reading it found, a page with text starting on Save
 * (or Skip, as `[defaults] page_text` says); only the text left on Save is kept, on this device.
 */
export function PageTextResultsView({
  result,
  isSaving,
  onSave,
}: {
  result: PageTextScanResult | null;
  isSaving: boolean;
  onSave: (items: PageTextScanItem[]) => void;
}) {
  const items = useMemo(() => result?.items ?? [], [result]);
  const { actionOf, setAction, chosen } = useReviewChoices<PageTextScanItem, PageTextAction>(
    items,
    (item) => item.id,
    (item) => (item.status === 'read' ? REVIEW_DEFAULT_ACTIONS.page_text : 'skip'),
  );
  const saved = chosen('save');

  if (!items.length) return <ToolEmptyState message={t('tools_pageTextNothing')} />;
  return (
    <div className="space-y-4">
      {result?.overLimit ? (
        <p className="text-xs text-warning">
          {tPlural('tools_pageTextOverLimit', result.overLimit)}
        </p>
      ) : null}
      <ReviewList
        items={items}
        idOf={(item) => item.id}
        categories={PAGE_TEXT_CATEGORIES}
        categoryOf={(item) => item.status}
        categoryLabel={(category, count) =>
          t(PAGE_TEXT_CATEGORY_LABEL_KEYS[category], String(count))
        }
        actionsOf={(item) => (item.status === 'read' ? PAGE_TEXT_ACTIONS : (['skip'] as const))}
        actionLabel={(action) =>
          action === 'save' ? t('tools_pageTextActionSave') : t('tools_reviewActionSkip')
        }
        batchActions={PAGE_TEXT_ACTIONS}
        actionOf={actionOf}
        onAction={setAction}
        titleOf={(item) => getBookmarkDisplayTitle(item.title)}
        disabled={isSaving}
        rowTestId="page-text-item"
        renderDetails={(item) => (
          <>
            <p className="truncate text-xs text-muted-foreground">
              <UrlLink href={item.url} />
            </p>
            {item.text ? <p className="line-clamp-2 text-xs">{item.text}</p> : null}
          </>
        )}
      />
      <ReviewFooter
        label={tPlural('tools_pageTextSaveSelected', saved.length)}
        busyLabel={t('action_saving')}
        busy={isSaving}
        disabled={saved.length === 0}
        onConfirm={() => onSave(saved)}
      />
    </div>
  );
}
