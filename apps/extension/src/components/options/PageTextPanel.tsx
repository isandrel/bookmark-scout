/**
 * Index Page Text in Options: how many pages' text the index keeps on this device, and a button
 * that deletes it. Deleting it never touches a bookmark, a tag, or the History.
 */
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export function PageTextPanel() {
  const [summary, setSummary] = useState<{ pages: number; chars: number }>();
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    getPageTextSummary()
      .then(setSummary)
      .catch(() => setSummary({ pages: 0, chars: 0 }));
  }, []);
  useEffect(() => {
    load();
    return watchPageTexts(load);
  }, [load]);

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
        <Button
          variant="outline"
          size="sm"
          disabled={!summary?.pages || clearing}
          onClick={() => void clear()}
        >
          <Trash2 />
          {t('pageText_clear')}
        </Button>
      }
    />
  );
}
