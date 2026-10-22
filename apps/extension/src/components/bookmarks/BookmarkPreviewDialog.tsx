/**
 * A bookmark's preview in the manager, opened from its item menu (Preview) or with the manager's
 * preview key on a focused row or card: the stored cover, title, address, folder, tags, and
 * summary, then the buttons of `[menus] preview` in config/ui/actions.toml. Everything comes from
 * this device; nothing is fetched, so without a stored cover none is shown.
 *
 * The dialog traps focus while open, Escape closes it, and closing gives focus back to the row or
 * card it shows, also when it was opened from a menu whose button is gone by then. A button closes
 * the preview first and runs its action once the preview is gone, so a dialog the action opens
 * (Edit) returns focus to that row as well.
 */
import { Folder } from 'lucide-react';
import { useRef } from 'react';

type BookmarkPreviewDialogProps = {
  /** The bookmark shown; null closes the preview. */
  bookmark: Bookmark | null;
  /** What the buttons' actions ask of the page: the table's item host. */
  host: ActionItemHost;
  onClose: () => void;
};

/** The row or card of the table that shows `rowId`, if it is on the page. */
function findRowElement(rowId: string | undefined): HTMLElement | null {
  if (!rowId) return null;
  return document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"]`);
}

export function BookmarkPreviewDialog({ bookmark, host, onClose }: BookmarkPreviewDialogProps) {
  // The last bookmark stays drawn while the dialog closes, so its content does not vanish first.
  const shownRef = useRef(bookmark);
  if (bookmark) shownRef.current = bookmark;
  const shown = bookmark ?? shownRef.current;
  // A button's action, run once the preview has closed.
  const pendingActionRef = useRef<(() => void) | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const { value: metadataById } = useStoredValue(bookmarkMetadataValue);

  const metadata = shown ? metadataById[shown.id] : undefined;
  const tags = metadata?.tags ?? [];
  const summary = metadata?.summary?.trim() ?? '';
  const sections = shown ? getItemMenuSections([shown], host, ACTION_MENUS.preview) : [];
  const [primaryAction] = sections.flat();

  const runAfterClose = (id: ActionId) => {
    if (!shown) return;
    const item = shown;
    pendingActionRef.current = () => runItemMenuAction(id, [item], host);
    onClose();
  };

  return (
    <Dialog
      open={bookmark !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (open) return;
        const run = pendingActionRef.current;
        pendingActionRef.current = null;
        run?.();
      }}
    >
      {/* Focus starts on the dialog itself, so a tall preview opens at its title; Tab reaches
          the address and then the buttons. */}
      <DialogContent
        ref={popupRef}
        initialFocus={popupRef}
        data-testid="bookmark-preview"
        // Back to the row or card shown; the default (the element focused before) is gone when
        // a menu opened the preview.
        finalFocus={() => findRowElement(shown?.id) ?? true}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        {shown ? (
          <>
            {/* Room on the right for the close button. */}
            <DialogHeader className="min-w-0 pr-6">
              <DialogTitle className="leading-snug [overflow-wrap:anywhere]">
                {shown.title.trim() || t('popup_untitled')}
              </DialogTitle>
              <DialogDescription className="[overflow-wrap:anywhere]">
                {shown.url ? <UrlLink href={shown.url} /> : null}
              </DialogDescription>
            </DialogHeader>
            {shown.url ? <BookmarkCover bookmarkId={shown.id} url={shown.url} /> : null}
            <dl className="grid min-w-0 gap-3 text-sm">
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  {t('bookmarks_detailsFolderPath')}
                </dt>
                <dd
                  className="flex min-w-0 items-start gap-2"
                  data-testid="bookmark-preview-folder"
                >
                  <Folder
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{shown.folderPath}</span>
                </dd>
              </div>
              {tags.length > 0 ? (
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{t('bookmarks_metadataTags')}</dt>
                  <dd>
                    <ul className="flex flex-wrap gap-1.5" data-testid="bookmark-preview-tags">
                      {tags.map((tag) => (
                        <li key={tag}>
                          <Badge variant="outline" className="font-normal">
                            {tag}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              {summary ? (
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">
                    {t('bookmarks_metadataSummary')}
                  </dt>
                  <dd
                    className="whitespace-pre-line [overflow-wrap:anywhere]"
                    data-testid="bookmark-preview-summary"
                  >
                    {summary}
                  </dd>
                </div>
              ) : null}
            </dl>
            <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-start sm:space-x-0">
              {sections.flat().map((id) => {
                const action = getAction(id);
                const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
                return (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={id === primaryAction ? 'default' : 'outline'}
                    data-action={id}
                    onClick={() => runAfterClose(id)}
                  >
                    {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
                    {getItemMenuLabel(id, [shown], host)}
                  </Button>
                );
              })}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
