import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { t } from '@/hooks/use-i18n';
import type {
  DuplicateScanResult,
  UrlCleanerResult,
  BookmarkStatistics,
  DeadLinkScanResult,
  MetadataFetchResult,
  PrivacyScanResult,
} from '@/services';

export function DuplicateResultsView({
  result,
  isRemoving,
  onClose,
  onConfirm,
}: {
  result: DuplicateScanResult | null;
  isRemoving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
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
                    <span className="font-medium">{item.node.title || 'Untitled'}</span>
                    {index === 0 ? <Badge>{t('state_keep') || 'Keep'}</Badge> : null}
                  </div>
                  <p className="break-all text-xs text-muted-foreground">{item.node.url}</p>
                  <p className="text-xs text-muted-foreground">{item.pathLabel || 'Root'}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <EmptyState message={t('state_noDuplicatesFound') || 'No duplicate bookmarks found.'} />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('action_cancel') || 'Cancel'}
        </Button>
        <Button onClick={onConfirm} disabled={!result?.groups.length || isRemoving}>
          {isRemoving
            ? t('action_removing') || 'Removing...'
            : t('action_removeDuplicates') || 'Remove duplicates'}
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
            <div className="font-medium">{preview.title}</div>
            <div className="text-xs text-muted-foreground">{preview.folderPath || 'Root'}</div>
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
        <EmptyState message={t('state_noUrlChangesFound') || 'No URL cleanup changes found.'} />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('action_cancel') || 'Cancel'}
        </Button>
        <Button onClick={onConfirm} disabled={!result?.previews.length || isApplying}>
          {isApplying ? t('action_applying') || 'Applying...' : t('action_applyChanges') || 'Apply Changes'}
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
      <StatCard label={t('stats_totalBookmarks') || 'Bookmarks'} value={result.totalBookmarks} />
      <StatCard label={t('stats_totalFolders') || 'Folders'} value={result.totalFolders} />
      <StatCard label={t('stats_deepestLevel') || 'Deepest level'} value={result.deepestLevel} />
      <StatCard label={t('stats_duplicates') || 'Duplicates'} value={result.duplicateCount} />
      <StatList label={t('stats_topDomains') || 'Top domains'} items={result.topDomains} />
      <StatList label={t('stats_topFolders') || 'Top folders'} items={result.topFolders} />
      <StatList label={t('stats_protocols') || 'Protocols'} items={result.protocols} />
    </div>
  );
}

export function DeadLinkResultsView({ result }: { result: DeadLinkScanResult | null }) {
  return result?.items.length ? (
    <div className="space-y-3">
      {result.items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{item.title}</span>
            <Badge variant={item.status === 'ok' ? 'secondary' : 'destructive'}>{item.status}</Badge>
          </div>
          <div className="break-all text-xs text-muted-foreground">{item.url}</div>
          <div className="text-xs text-muted-foreground">{item.message}</div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState message={t('state_noDeadLinksFound') || 'No broken links found.'} />
  );
}

export function MetadataResultsView({ result }: { result: MetadataFetchResult | null }) {
  return result?.items.length ? (
    <div className="space-y-3">
      {result.items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="font-medium">{item.title}</div>
          <div className="break-all text-xs text-muted-foreground">{item.url}</div>
          {item.suggestedTitle ? <div className="text-sm">Suggested title: {item.suggestedTitle}</div> : null}
          {item.description ? <div className="text-xs text-muted-foreground">{item.description}</div> : null}
          <div className="text-xs text-muted-foreground">{item.message}</div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState message={t('state_noMetadataFound') || 'No metadata updates found.'} />
  );
}

export function PrivacyResultsView({ result }: { result: PrivacyScanResult | null }) {
  return result?.items.length ? (
    <div className="space-y-3">
      {result.items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{item.title}</span>
            <Badge variant={item.severity === 'high' ? 'destructive' : 'outline'}>{item.severity}</Badge>
          </div>
          <div className="break-all text-xs text-muted-foreground">{item.url}</div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {item.findings.map((finding) => (
              <li key={`${item.id}-${finding}`}>{finding}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState message={t('state_noPrivacyIssuesFound') || 'No privacy issues found.'} />
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
              <span className="truncate pr-4">{item.label}</span>
              <Badge variant="secondary">{item.count}</Badge>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">{t('state_noData') || 'No data available.'}</div>
        )}
      </div>
    </div>
  );
}
