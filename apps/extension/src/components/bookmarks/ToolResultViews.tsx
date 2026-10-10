import { Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

export function describeDeadLink(item: DeadLinkResultItem): string {
  switch (item.status) {
    case 'ok':
      return t('tools_deadLinkReachable');
    case 'redirect':
      return item.redirectUrl
        ? t('tools_deadLinkRedirectsTo', item.redirectUrl)
        : t('tools_deadLinkRedirected');
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
      return item.errorKind === 'redirect' ? t('tools_redirectFailed') : t('tools_networkFailed');
    }
  }
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
      return item.changed ? t('tools_metadataAvailable') : t('tools_metadataNoChange');
  }
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
    case 'fragment':
      return t('tools_privacyFragment');
    case 'email':
      return t('tools_privacyEmail');
    case 'uuid':
      return t('tools_privacyUuid');
  }
}

function privacyFindingKey(finding: PrivacyFinding): string {
  return 'param' in finding ? `${finding.kind}:${finding.param}` : finding.kind;
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
        <span className="font-medium">{title}</span>
        {badges ? <div className="flex flex-shrink-0 items-center gap-1">{badges}</div> : null}
      </div>
      {children}
    </>
  );
  return leading ? (
    <div data-slot="tool-result-row" className="flex gap-3 rounded-lg border p-3 text-sm">
      {leading}
      <div className="min-w-0 flex-1 space-y-2">{details}</div>
    </div>
  ) : (
    <div data-slot="tool-result-row" className="space-y-2 rounded-lg border p-3 text-sm">
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
  onConfirm: () => void;
  /** Outcome of a partial removal, shown above the refreshed groups. */
  notice?: string;
  onUndo?: () => void;
}) {
  // Title-only matching can group bookmarks that point to different pages; removing the
  // extras would then delete those pages, so say so before the user confirms.
  const mixedUrlKeys = new Set(
    result?.match.strategy === 'title_only'
      ? result.groups
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
      {result?.groups.length ? (
        result.groups.map((group) => (
          <div key={group.key} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{group.items.length}</Badge>
              <code className="truncate text-xs text-muted-foreground">{group.key}</code>
              {mixedUrlKeys.has(group.key) ? (
                <Badge variant="outline">{t('tools_duplicatesDifferentUrls')}</Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              {group.items.map((item, index) => (
                <div key={item.node.id} className="rounded-md bg-muted/40 p-2 text-sm">
                  <div className="flex items-center gap-2">
                    {index === 0 ? <Info className="h-3.5 w-3.5 text-primary" /> : null}
                    <span data-slot="tool-result-title" className="font-medium">
                      {getBookmarkDisplayTitle(item.node.title)}
                    </span>
                    {index === 0 ? <Badge>{t('state_keep')}</Badge> : null}
                  </div>
                  <p className="break-all text-xs text-muted-foreground">
                    <UrlLink href={item.node.url ?? ''} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.pathLabel || t('tools_rootFolder')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <ToolEmptyState message={t('state_noDuplicatesFound')} />
      )}

      <ReviewFooter
        label={t('action_removeDuplicates')}
        busyLabel={t('action_removing')}
        busy={isRemoving}
        disabled={!result?.groups.length}
        onConfirm={onConfirm}
        onCancel={onClose}
      />
    </div>
  );
}

export function UrlCleanerResultsView({
  result,
  isApplying,
  onClose,
  onConfirm,
}: {
  result: UrlCleanerResult | null;
  isApplying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
      {result?.previews.length ? (
        result.previews.map((preview) => (
          <ToolResultRow key={preview.id} title={getBookmarkDisplayTitle(preview.title)}>
            <div className="text-xs text-muted-foreground">
              {preview.folderPath || t('tools_rootFolder')}
            </div>
            <div className="break-all rounded-md bg-muted/40 p-2 text-xs">
              <UrlLink href={preview.originalUrl} />
            </div>
            <div className="break-all rounded-md bg-success-wash p-2 text-xs text-success">
              <UrlLink href={preview.cleanedUrl} />
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.removedParams.map((param) => (
                <Badge key={`${preview.id}-${param}`} variant="outline">
                  {param}
                </Badge>
              ))}
            </div>
          </ToolResultRow>
        ))
      ) : (
        <ToolEmptyState message={t('state_noUrlChangesFound')} />
      )}

      <ReviewFooter
        label={t('action_applyChanges')}
        busyLabel={t('action_applying')}
        busy={isApplying}
        disabled={!result?.previews.length}
        onConfirm={onConfirm}
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
  const confirmed = result?.items.filter(isConfirmedDeadLink).length ?? 0;
  const needsCheck =
    result?.items.filter((item) => item.category && !isConfirmedDeadLink(item)).length ?? 0;
  const redirected = result?.items.filter((item) => item.status === 'redirect').length ?? 0;
  const repairable = result?.items.filter(isDeadLinkRepairCandidate).length ?? 0;
  return result?.items.length ? (
    <div className="space-y-3">
      <div
        data-testid="dead-link-summary"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"
      >
        <span>
          {t('tools_deadLinkSummary', [String(confirmed), String(needsCheck), String(redirected)])}
        </span>
        {onReview && repairable > 0 ? (
          <Button size="sm" onClick={onReview}>
            {t('tools_deadLinkReview')}
          </Button>
        ) : null}
      </div>
      {result.items.map((item) => (
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
          <ResultLine>{describeDeadLink(item)}</ResultLine>
        </ToolResultRow>
      ))}
    </div>
  ) : (
    <ToolEmptyState message={t('state_noDeadLinksFound')} />
  );
}

export function MetadataResultsView({
  result,
  isApplying,
  onApply,
}: {
  result: MetadataFetchResult | null;
  isApplying: boolean;
  onApply: (items: MetadataFetchResultItem[]) => void;
}) {
  const applicable = useMemo(
    () => result?.items.filter((item) => item.changed && item.suggestedTitle) ?? [],
    [result],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set(applicable.map((item) => item.id)));
  }, [applicable]);

  const toggle = (id: string, checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  if (!result?.items.length) {
    return <ToolEmptyState message={t('state_noMetadataFound')} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {result.items.map((item) => {
          const canApply = item.changed && Boolean(item.suggestedTitle);
          const title = getBookmarkDisplayTitle(item.title);
          return (
            <ToolResultRow
              key={item.id}
              title={title}
              leading={
                canApply ? (
                  <Checkbox
                    id={`metadata-apply-${item.id}`}
                    className="mt-0.5"
                    checked={selected.has(item.id)}
                    onCheckedChange={(checked) => toggle(item.id, checked === true)}
                    aria-label={t('tools_metadataApplyItem', title)}
                  />
                ) : undefined
              }
            >
              <ResultLine>
            <UrlLink href={item.url} />
          </ResultLine>
              {item.status === 'ok' && item.suggestedTitle ? (
                <div className="text-sm">{t('tools_suggestedTitle', item.suggestedTitle)}</div>
              ) : null}
              {item.status === 'ok' && item.description ? (
                <div className="text-xs text-muted-foreground">{item.description}</div>
              ) : null}
              <ResultLine>{describeMetadata(item)}</ResultLine>
            </ToolResultRow>
          );
        })}
      </div>
      {applicable.length ? (
        <ReviewFooter
          label={tPlural('tools_metadataApplySelected', selected.size)}
          busyLabel={t('action_applying')}
          busy={isApplying}
          disabled={selected.size === 0}
          onConfirm={() => onApply(applicable.filter((item) => selected.has(item.id)))}
        />
      ) : null}
    </div>
  );
}

const SITE_ICON_SUMMARY: Array<{ key: string; labelKey: string }> = [
  { key: 'updated', labelKey: 'tools_siteIconStatus_updated' },
  { key: 'unchanged', labelKey: 'tools_siteIconStatus_unchanged' },
  { key: 'noIcon', labelKey: 'tools_siteIconStatus_noIcon' },
  { key: 'failed', labelKey: 'tools_siteIconStatus_failed' },
  { key: 'skipped', labelKey: 'tools_siteIconStatus_skipped' },
];

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

export function SiteIconResultsView({
  result,
  isSaving,
  onSave,
}: {
  result: SiteIconRefreshResult | null;
  isSaving: boolean;
  onSave: () => void;
}) {
  const counts = useMemo(() => {
    const totals: Record<string, number> = {
      updated: 0,
      unchanged: 0,
      noIcon: 0,
      failed: 0,
      skipped: result?.skippedBookmarks ?? 0,
    };
    for (const item of result?.items ?? []) totals[item.status] += 1;
    return totals;
  }, [result]);
  const savable = counts.updated + counts.unchanged;

  if (!result || (result.items.length === 0 && result.skippedBookmarks === 0)) {
    return <ToolEmptyState message={t('state_noSiteIconsFound')} />;
  }

  return (
    <div className="space-y-4">
      <dl data-testid="site-icons-summary" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SITE_ICON_SUMMARY.map(({ key, labelKey }) => (
          <div key={key} data-status={key} className="rounded-lg border p-2">
            <dt className="text-xs text-muted-foreground">{t(labelKey)}</dt>
            <dd className="text-lg font-semibold">{counts[key]}</dd>
          </div>
        ))}
      </dl>
      {result.skippedBookmarks > 0 ? (
        <p className="text-xs text-muted-foreground">
          {tPlural('tools_siteIconsSkippedDesc', result.skippedBookmarks)}
        </p>
      ) : null}
      <div className="space-y-3">
        {result.items.map((item) => (
          <div
            key={item.origin}
            data-origin={item.origin}
            className="flex gap-3 rounded-lg border p-3 text-sm"
          >
            {item.icon ? (
              <img src={item.icon} alt="" width={32} height={32} className="size-8 shrink-0" />
            ) : (
              <div className="size-8 shrink-0 rounded-md bg-muted" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <UrlLink href={item.origin} className="break-all font-medium" />
                <Badge
                  variant={
                    item.status === 'failed'
                      ? 'destructive'
                      : item.status === 'updated'
                        ? 'default'
                        : 'outline'
                  }
                >
                  {t(`tools_siteIconStatus_${item.status}`)}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {tPlural('tools_siteIconsBookmarkCount', item.bookmarkCount)}
              </div>
              <div className="break-all text-xs text-muted-foreground">
                {describeSiteIcon(item)}
              </div>
              {item.keepsCachedIcon && (item.status === 'failed' || item.status === 'noIcon') ? (
                <div className="text-xs text-muted-foreground">
                  {t('tools_siteIconsKeptCached')}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {savable > 0 ? (
        <ReviewFooter
          label={tPlural('tools_siteIconsSave', savable)}
          busyLabel={t('action_saving')}
          busy={isSaving}
          onConfirm={onSave}
        />
      ) : null}
    </div>
  );
}

export function PrivacyResultsView({ result }: { result: PrivacyScanResult | null }) {
  return result?.items.length ? (
    <div className="space-y-3">
      {result.items.map((item) => (
        <ToolResultRow
          key={item.id}
          title={getBookmarkDisplayTitle(item.title)}
          badges={
            <Badge variant={item.severity === 'high' ? 'destructive' : 'outline'}>
              {t(`tools_privacySeverity_${item.severity}`)}
            </Badge>
          }
        >
          <ResultLine>
            <UrlLink href={item.url} />
          </ResultLine>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {item.findings.map((finding) => (
              <li key={`${item.id}-${privacyFindingKey(finding)}`}>
                {describePrivacyFinding(finding)}
              </li>
            ))}
          </ul>
        </ToolResultRow>
      ))}
    </div>
  ) : (
    <ToolEmptyState message={t('state_noPrivacyIssuesFound')} />
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
export function AIMetadataResultsView({
  items,
  saveLabel,
  isSaving,
  onSave,
}: {
  items: readonly AIMetadataSuggestion[];
  saveLabel: string;
  isSaving: boolean;
  onSave: () => void;
}) {
  if (!items.length) return <ToolEmptyState message={t('state_noAiResults')} />;
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ToolResultRow key={item.bookmarkId} title={getBookmarkDisplayTitle(item.title)}>
          <ResultLine>
            <UrlLink href={item.url} />
          </ResultLine>
          {item.tags ? (
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <Badge key={`${item.bookmarkId}-${tag}`} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {item.summary !== undefined ? (
            <div className="rounded-md bg-muted/40 p-2 text-sm">{item.summary}</div>
          ) : null}
          {item.reason !== undefined ? (
            <div className="text-xs text-muted-foreground">{item.reason}</div>
          ) : null}
        </ToolResultRow>
      ))}
      <ReviewFooter
        label={saveLabel}
        busyLabel={t('action_saving')}
        busy={isSaving}
        onConfirm={onSave}
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
