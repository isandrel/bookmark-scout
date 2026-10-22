/**
 * Index Page Text in Options: how many pages' text the index keeps on this device, how much of
 * the library it covers (indexed of the bookmarks that can be, out of date, and failed in the last
 * run), **Retry failed**, which starts a run on just those bookmarks, and a button that deletes
 * the index. Deleting it never touches a bookmark, a tag, or the History.
 */
import { RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export function PageTextPanel() {
  const [summary, setSummary] = useState<{ pages: number; chars: number }>();
  const [coverage, setCoverage] = useState<PageTextCoverage>();
  const [clearing, setClearing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const job = useLatestJob('pageText');
  const running = job ? isJobActive(job) : false;
  const hostAccess = usePermissionGate('webAccess');

  const load = useCallback(() => {
    getPageTextSummary()
      .then(setSummary)
      .catch(() => setSummary({ pages: 0, chars: 0 }));
    getPageTextCoverage()
      .then(setCoverage)
      .catch(() => setCoverage(undefined));
  }, []);
  const jobState = `${job?.id}:${job?.state}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a run that ends changes which pages failed, so the newest run's state reads the coverage again.
  useEffect(() => {
    load();
    return watchPageTexts(load);
  }, [load, jobState]);

  const clear = async () => {
    setClearing(true);
    try {
      await clearPageTexts();
      toast.success({ title: t('pageText_cleared'), description: t('pageText_clearedDesc') });
    } catch (error) {
      toast.error({ title: t('toast_toolFailed'), description: getErrorMessage(error) });
    } finally {
      setClearing(false);
    }
  };

  // The failed pages only, through the same job and the same website access as a run from Tools.
  const retry = (failed: readonly PageTextScanItem[]) => {
    const start = async () => {
      setRetrying(true);
      try {
        const response = await sendJobCommand({
          type: 'start',
          commandId: crypto.randomUUID(),
          kind: 'pageText',
          source: 'options',
          scope: { mode: 'all' },
          sites: getUrlSites(failed.map((item) => item.url)),
          bookmarkIds: failed.map((item) => item.id),
        }).catch(() => undefined);
        if (!response?.ok) {
          toast.error({ title: t('jobs_commandFailed') });
          return;
        }
        toast.success({
          title: tPlural('pageText_retryStarted', failed.length),
          description: t('pageText_retryStartedDesc'),
        });
      } finally {
        setRetrying(false);
      }
    };
    void hostAccess.run(start, getUrlSites(failed.map((item) => item.url)));
  };

  const failed = coverage?.failed ?? [];
  return (
    <OptionsPanel
      id="page-text-index"
      data-testid="page-text-index"
      title={t('pageText_indexTitle')}
      description={
        summary
          ? tPlural('pageText_indexSummary', summary.pages, [formatCount(summary.chars)])
          : t('pageText_indexLoading')
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={failed.length === 0 || running || retrying}
            onClick={() => retry(failed)}
          >
            <RotateCcw />
            {t('pageText_retryFailed')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!summary?.pages || clearing}
            onClick={() => void clear()}
          >
            <Trash2 />
            {t('pageText_clear')}
          </Button>
        </div>
      }
    >
      {coverage ? (
        <ul className="space-y-1 text-sm" data-testid="page-text-coverage">
          <li>
            {t('pageText_coverageIndexed', [
              formatCount(coverage.indexed),
              formatCount(coverage.eligible),
            ])}
          </li>
          <li>{t('pageText_coverageStale', formatCount(coverage.stale))}</li>
          <li>{t('pageText_coverageFailed', formatCount(failed.length))}</li>
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('pageText_accessNote')}</p>
      <PermissionDialog {...hostAccess.dialogProps} />
    </OptionsPanel>
  );
}
