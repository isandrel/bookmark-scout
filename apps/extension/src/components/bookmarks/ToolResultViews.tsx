import { Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function describeDeadLink(item: DeadLinkResultItem): string {
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
    default:
      if (item.statusCode !== undefined) {
        return t('tools_deadLinkHttpStatus', String(item.statusCode));
      }
      return item.errorKind === 'redirect' ? t('tools_redirectFailed') : t('tools_networkFailed');
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
      return finding.withPassword
        ? t('tools_privacyCredentials')
        : t('tools_privacyUsername');
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
  return (
    <div className="space-y-4">
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
            </div>
            <div className="space-y-2">
              {group.items.map((item, index) => (
                <div key={item.node.id} className="rounded-md bg-muted/40 p-2 text-sm">
                  <div className="flex items-center gap-2">
                    {index === 0 ? <Info className="h-3.5 w-3.5 text-primary" /> : null}
                    <span className="font-medium">{item.node.title || t('bookmarks_untitled')}</span>
                    {index === 0 ? <Badge>{t('state_keep')}</Badge> : null}
                  </div>
                  <p className="break-all text-xs text-muted-foreground">{item.node.url}</p>
                  <p className="text-xs text-muted-foreground">{item.pathLabel || t('tools_rootFolder')}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <EmptyState message={t('state_noDuplicatesFound')} />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('action_cancel')}
        </Button>
        <Button onClick={onConfirm} disabled={!result?.groups.length || isRemoving}>
          {isRemoving
            ? t('action_removing')
            : t('action_removeDuplicates')}
        </Button>
      </div>
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
          <div key={preview.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="font-medium">{preview.title || t('bookmarks_untitled')}</div>
            <div className="text-xs text-muted-foreground">{preview.folderPath || t('tools_rootFolder')}</div>
            <div className="break-all rounded-md bg-muted/40 p-2 text-xs">{preview.originalUrl}</div>
            <div className="break-all rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
              {preview.cleanedUrl}
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.removedParams.map((param) => (
                <Badge key={`${preview.id}-${param}`} variant="outline">
                  {param}
                </Badge>
              ))}
            </div>
          </div>
        ))
      ) : (
        <EmptyState message={t('state_noUrlChangesFound')} />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('action_cancel')}
        </Button>
        <Button onClick={onConfirm} disabled={!result?.previews.length || isApplying}>
          {isApplying ? t('action_applying') : t('action_applyChanges')}
        </Button>
      </div>
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

export function DeadLinkResultsView({ result }: { result: DeadLinkScanResult | null }) {
  return result?.items.length ? (
    <div className="space-y-3">
      {result.items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{item.title || t('bookmarks_untitled')}</span>
            <Badge
              variant={
                item.status === 'ok' || item.status === 'skipped' ? 'secondary' : 'destructive'
              }
            >
              {t(`tools_deadLinkStatus_${item.status}`)}
            </Badge>
          </div>
          <div className="break-all text-xs text-muted-foreground">{item.url}</div>
          <div className="break-all text-xs text-muted-foreground">{describeDeadLink(item)}</div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState message={t('state_noDeadLinksFound')} />
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
    return <EmptyState message={t('state_noMetadataFound')} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {result.items.map((item) => {
          const canApply = item.changed && Boolean(item.suggestedTitle);
          const checkboxId = `metadata-apply-${item.id}`;
          return (
            <div key={item.id} className="flex gap-3 rounded-lg border p-3 text-sm">
              {canApply ? (
                <Checkbox
                  id={checkboxId}
                  className="mt-0.5"
                  checked={selected.has(item.id)}
                  onCheckedChange={(checked) => toggle(item.id, checked === true)}
                  aria-label={t('tools_metadataApplyItem', item.title || t('bookmarks_untitled'))}
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="font-medium">{item.title || t('bookmarks_untitled')}</div>
                <div className="break-all text-xs text-muted-foreground">{item.url}</div>
                {item.status === 'ok' && item.suggestedTitle ? (
                  <div className="text-sm">{t('tools_suggestedTitle', item.suggestedTitle)}</div>
                ) : null}
                {item.status === 'ok' && item.description ? (
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                ) : null}
                <div className="text-xs text-muted-foreground">{describeMetadata(item)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {applicable.length ? (
        <div className="flex justify-end">
          <Button
            onClick={() => onApply(applicable.filter((item) => selected.has(item.id)))}
            disabled={isApplying || selected.size === 0}
          >
            {isApplying
              ? t('action_applying')
              : tPlural('tools_metadataApplySelected', selected.size)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PrivacyResultsView({ result }: { result: PrivacyScanResult | null }) {
  return result?.items.length ? (
    <div className="space-y-3">
      {result.items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{item.title || t('bookmarks_untitled')}</span>
            <Badge variant={item.severity === 'high' ? 'destructive' : 'outline'}>
              {t(`tools_privacySeverity_${item.severity}`)}
            </Badge>
          </div>
          <div className="break-all text-xs text-muted-foreground">{item.url}</div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {item.findings.map((finding) => (
              <li key={`${item.id}-${privacyFindingKey(finding)}`}>
                {describePrivacyFinding(finding)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState message={t('state_noPrivacyIssuesFound')} />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {message}
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
            <div key={`${label}-${item.label}`} className="flex items-center justify-between text-sm">
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
