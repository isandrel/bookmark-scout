/**
 * Fetch Covers in Options: how many covers are stored on this device and how much room they take,
 * Choose covers to delete some of them, and a button that deletes them all. Deleting them never
 * touches a bookmark, a tag, or the History.
 */
import { Images, Trash2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

// The list loads when it is first opened, so Options does not grow.
const CoverPickerDialog = lazy(() =>
  import('./CoverPickerDialog.lazy').then((module) => ({ default: module.CoverPickerDialog })),
);

export function CoversPanel() {
  const [summary, setSummary] = useState<{ covers: number; bytes: number }>();
  const [clearing, setClearing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [chooserLoaded, setChooserLoaded] = useState(false);

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
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={!summary?.covers}
            onClick={() => {
              setChooserLoaded(true);
              setChoosing(true);
            }}
          >
            <Images />
            {t('covers_choose')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!summary?.covers || clearing}
            onClick={() => void clear()}
          >
            <Trash2 />
            {t('covers_clear')}
          </Button>
          {chooserLoaded && (
            <Suspense fallback={null}>
              <CoverPickerDialog open={choosing} onOpenChange={setChoosing} />
            </Suspense>
          )}
        </>
      }
    />
  );
}
