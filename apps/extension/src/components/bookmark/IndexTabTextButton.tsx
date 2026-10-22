/**
 * Index this page's text: on the popup line that says where the current page is saved, a button
 * that reads the text the tab shows (`readTabPageText`), as the user sees it, and shows it with a
 * privacy reminder before anything is kept, so text from an account page or a message is never
 * saved unseen. Shown only while Index Page Text is on.
 */
import { TextSearch } from 'lucide-react';
import { useState } from 'react';

const ERROR_KEYS = {
  changed: 'pageText_tabChanged',
  private: 'pageText_tabPrivate',
  denied: 'pageText_tabDenied',
  empty: 'pageText_tabEmpty',
  signIn: 'pageText_tabSignIn',
  full: 'pageText_tabFull',
} as const satisfies Record<TabPageTextError, MessageKey>;

export function IndexTabTextButton({ url }: { url: string }) {
  const { settings } = useSettings();
  const [page, setPage] = useState<TabPageText | null>(null);
  const [busy, setBusy] = useState(false);

  if (!settings.pageTextEnabled) return null;

  const read = async () => {
    setBusy(true);
    try {
      const result = await readTabPageText(url);
      if ('error' in result) {
        toast.error({ title: t('pageText_tabFailed'), description: t(ERROR_KEYS[result.error]) });
      } else {
        setPage(result.page);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!page) return;
    try {
      const { saved, notSaved } = await savePageTexts(page.pages);
      if (notSaved > 0) {
        // Storage is full: never reported as saved.
        toast.error({
          title: t('toast_pageTextPartial'),
          description: t('toast_pageTextPartialDesc', [String(saved), String(notSaved)]),
        });
      } else {
        toast.success({
          title: t('toast_pageTextSaved'),
          description: tPlural('toast_pageTextSavedDesc', saved),
        });
      }
    } catch (error) {
      toast.error({ title: t('pageText_tabFailed'), description: getErrorMessage(error) });
    }
    setPage(null);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-5 shrink-0"
        aria-label={t('pageText_tabButton')}
        title={t('pageText_tabButton')}
        disabled={busy}
        data-testid="index-tab-text"
        onClick={() => void read()}
      >
        <TextSearch className="size-3.5" />
      </Button>
      <Dialog open={page !== null} onOpenChange={(open) => !open && setPage(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pageText_tabTitle')}</DialogTitle>
            <DialogDescription>{t('pageText_tabWarning')}</DialogDescription>
          </DialogHeader>
          {page ? (
            <p
              data-testid="index-tab-text-preview"
              className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-2 text-xs"
            >
              {page.text}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPage(null)}>
              {t('pageText_tabDiscard')}
            </Button>
            <Button onClick={() => void save()}>{t('tools_pageTextActionSave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
