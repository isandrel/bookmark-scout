/**
 * Choose covers (Options > Page Details > Bookmark covers): every cover stored on this device in
 * the shared review list, by kind (the page's own image or a picture of the tab), each on Keep or
 * Delete, and Delete for the chosen ones with Undo. Loaded when the button is first pressed, so
 * Options does not grow. Deleting a cover never touches a bookmark, a tag, or the History.
 */
import { useEffect, useMemo, useState } from 'react';

type CoverAction = 'keep' | 'delete';
const COVER_ACTIONS = ['keep', 'delete'] as const satisfies readonly CoverAction[];
const COVER_ACTION_LABEL_KEYS = {
  keep: 'state_keep',
  delete: 'action_delete',
} as const satisfies Record<CoverAction, MessageKey>;
const COVER_KIND_LABEL_KEYS = {
  page: 'covers_kindPage',
  screenshot: 'covers_kindScreenshot',
} as const satisfies Record<CoverKind, MessageKey>;
const COVER_KIND_ORDER: readonly CoverKind[] = ['page', 'screenshot'];

/** A stored cover with the title of its bookmark. */
type StoredCover = CoverInfo & { title: string };

async function readStoredCovers(): Promise<StoredCover[]> {
  const infos = [...(await getCoverInfos()).values()].sort((a, b) => b.savedAt - a.savedAt);
  const [first, ...rest] = infos.map((info) => info.bookmarkId);
  if (first === undefined) return [];
  const bookmarks = await browser.bookmarks.get([first, ...rest]).catch(
    // One id gone since the covers were read fails the whole call; read them one by one then.
    () =>
      Promise.all(
        infos.map((info) =>
          browser.bookmarks.get(info.bookmarkId).then(
            ([b]) => b,
            () => undefined,
          ),
        ),
      ),
  );
  const titles = new Map(
    bookmarks.flatMap((bookmark) => (bookmark ? [[bookmark.id, bookmark.title]] : [])),
  );
  return infos.map((info) => ({
    ...info,
    title: getBookmarkDisplayTitle(titles.get(info.bookmarkId) ?? info.url),
  }));
}

function CoverThumbnail({ cover }: { cover: StoredCover }) {
  const src = useCoverImage(cover.bookmarkId, cover.url);
  return (
    <span className="block h-12 w-[5.75rem] shrink-0 overflow-hidden rounded border bg-muted">
      {src ? (
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover object-top" />
      ) : null}
    </span>
  );
}

export function CoverPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [covers, setCovers] = useState<StoredCover[]>();
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const load = () =>
      void readStoredCovers()
        .then((next) => {
          if (!stopped) setCovers(next);
        })
        .catch(() => {
          if (!stopped) setCovers([]);
        });
    load();
    const stop = watchCovers(load);
    return () => {
      stopped = true;
      stop();
    };
  }, [open]);

  const items = useMemo(() => covers ?? [], [covers]);
  const categories = useMemo(
    () =>
      COVER_KIND_ORDER.filter((kind) => items.some((cover) => coverKind(cover.source) === kind)),
    [items],
  );
  const { actionOf, setAction, chosen } = useReviewChoices<StoredCover, CoverAction>(
    items,
    (cover) => cover.bookmarkId,
    () => REVIEW_DEFAULT_ACTIONS.stored_covers,
  );
  const deleting = chosen('delete');

  const remove = () => {
    onOpenChange(false);
    void removeCoversWithUndo(deleting.map((cover) => ({ id: cover.bookmarkId })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col" data-testid="cover-picker">
        <DialogHeader>
          <DialogTitle>{t('covers_storeTitle')}</DialogTitle>
          <DialogDescription>{t('covers_chooseDesc')}</DialogDescription>
        </DialogHeader>
        {covers === undefined ? (
          <p className="text-sm text-muted-foreground">{t('covers_storeLoading')}</p>
        ) : (
          <ReviewList
            items={items}
            idOf={(cover) => cover.bookmarkId}
            categories={categories}
            categoryOf={(cover) => coverKind(cover.source)}
            categoryLabel={(kind, count) =>
              t('review_categoryNamed', [t(COVER_KIND_LABEL_KEYS[kind]), String(count)])
            }
            actionsOf={() => COVER_ACTIONS}
            actionLabel={(action) => t(COVER_ACTION_LABEL_KEYS[action])}
            batchActions={COVER_ACTIONS}
            actionOf={actionOf}
            onAction={setAction}
            titleOf={(cover) => cover.title}
            rowTestId="stored-cover"
            renderDetails={(cover) => (
              <div className="flex min-w-0 items-center gap-3">
                <CoverThumbnail cover={cover} />
                <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                  <p className="truncate">{getUrlHostname(cover.url)}</p>
                  <p className="truncate">
                    {[describeCoverSource(cover), formatKilobytes(cover.bytes)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}
          />
        )}
        <DialogFooter>
          <Button variant="destructive" disabled={deleting.length === 0} onClick={remove}>
            {tPlural('covers_deleteCount', deleting.length, [String(deleting.length)])}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
