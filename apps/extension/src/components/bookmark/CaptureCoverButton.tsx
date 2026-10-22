/**
 * Use this view as the cover: on the popup line that says where the current page is saved, a
 * button that takes a picture of the tab (`captureTabCover`) and shows it with a privacy warning
 * before anything is kept, so a picture of an account page or a message is never saved unseen.
 * Shown only while Fetch Covers is on.
 */
import { ImagePlus } from 'lucide-react';
import { useState } from 'react';

const ERROR_KEYS = {
  changed: 'covers_captureChanged',
  private: 'covers_capturePrivate',
  denied: 'covers_captureDenied',
  unreadable: 'covers_captureUnreadable',
} as const satisfies Record<TabCoverError, MessageKey>;

export function CaptureCoverButton({ url }: { url: string }) {
  const { settings } = useSettings();
  const [cover, setCover] = useState<TabCover | null>(null);
  const [busy, setBusy] = useState(false);

  if (!settings.coversEnabled) return null;

  const capture = async () => {
    setBusy(true);
    try {
      const result = await captureTabCover(url, settings.coversWidthPx);
      if ('error' in result) {
        toast.error({ title: t('covers_captureFailed'), description: t(ERROR_KEYS[result.error]) });
      } else {
        setCover(result.cover);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!cover) return;
    try {
      const { saved, notSaved } = await saveCovers(
        cover.covers,
        settings.coversMaxCacheMb * BYTES_PER_MB,
      );
      if (notSaved > 0) {
        // Storage is full: never reported as saved.
        toast.error({
          title: t('toast_coversPartial'),
          description: t('toast_coversPartialDesc', [String(saved), String(notSaved)]),
        });
      } else {
        toast.success({
          title: t('covers_captureSaved'),
          description: t('covers_captureSavedDesc'),
        });
      }
    } catch (error) {
      toast.error({ title: t('covers_captureFailed'), description: getErrorMessage(error) });
    }
    setCover(null);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-5 shrink-0"
        aria-label={t('covers_captureButton')}
        title={t('covers_captureButton')}
        disabled={busy}
        data-testid="capture-cover"
        onClick={() => void capture()}
      >
        <ImagePlus className="size-3.5" />
      </Button>
      <Dialog open={cover !== null} onOpenChange={(open) => !open && setCover(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('covers_captureTitle')}</DialogTitle>
            <DialogDescription>{t('covers_captureWarning')}</DialogDescription>
          </DialogHeader>
          {cover ? (
            <img
              src={cover.preview}
              alt=""
              data-testid="capture-cover-preview"
              className="aspect-[1.91/1] w-full rounded-md border object-cover object-top"
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCover(null)}>
              {t('covers_captureDiscard')}
            </Button>
            <Button onClick={() => void save()}>{t('tools_coversActionSave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
