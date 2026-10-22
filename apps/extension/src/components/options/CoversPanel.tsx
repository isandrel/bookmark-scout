/**
 * Fetch Covers in Options: how many covers are stored on this device and how much room they take,
 * and a button that deletes them. Deleting them never touches a bookmark, a tag, or the History.
 */
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export function CoversPanel() {
  const [summary, setSummary] = useState<{ covers: number; bytes: number }>();
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    getCoverSummary()
      .then(setSummary)
      .catch(() => setSummary({ covers: 0, bytes: 0 }));
  }, []);
  useEffect(() => {
    load();
    return watchCovers(load);
  }, [load]);

  const clear = async () => {
    setClearing(true);
    try {
      await clearCovers();
      toast.success({ title: t('covers_cleared'), description: t('covers_clearedDesc') });
    } catch (error) {
      toast.error({ title: t('toast_toolFailed'), description: getErrorMessage(error) });
    } finally {
      setClearing(false);
    }
  };

  return (
    <OptionsPanel
      id="covers-store"
      data-testid="covers-store"
      title={t('covers_storeTitle')}
      description={
        summary
          ? tPlural('covers_storeSummary', summary.covers, [formatMegabytes(summary.bytes)])
          : t('covers_storeLoading')
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={!summary?.covers || clearing}
          onClick={() => void clear()}
        >
          <Trash2 />
          {t('covers_clear')}
        </Button>
      }
    />
  );
}
