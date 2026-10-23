/**
 * A bookmark's preview in the manager, opened from its item menu (Preview) or with the manager's
 * preview key on a focused row or card: the stored cover, title, address, folder, tags, summary,
 * and where the cover came from (with Fetch cover and Remove cover beside it), then the buttons of `[menus]
 * preview` in config/ui/actions.toml. Everything comes from this device; nothing is fetched, so
 * without a stored cover none is shown.
 *
 * Previous and Next (and the preview's keys, `managerPreview` in config/ui/shortcuts.toml, unless
 * a text field has focus) show the bookmark before or after it in `rows`, the table's page as
 * shown, skipping folders and separators; they stop at either end, where their button is disabled
 * but keeps focus. They sit at the top, so a preview of another height never moves them.
 *
 * The dialog traps focus while open, Escape closes it, and closing gives focus back to the row or
 * card it shows last, also when it was opened from a menu whose button is gone by then. A button
 * closes the preview first and runs its action once the preview is gone, so a dialog the action
 * opens (Edit) returns focus to that row as well.
 */
import { ChevronLeft, ChevronRight, Folder } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

type BookmarkPreviewDialogProps = {
  /** The bookmark shown; null closes the preview. */
  bookmark: Bookmark | null;
  /** The rows Previous and Next step through, in display order. */
  rows: readonly Bookmark[];
  /** What the buttons' actions ask of the page: the table's item host. */
  host: ActionItemHost;
  /** Shows another bookmark of `rows` (Previous and Next). */
  onShow: (bookmark: Bookmark) => void;
  onClose: () => void;
};

const { managerPreview } = SHORTCUT_BINDINGS;

/** The item-menu actions on a bookmark's cover, offered beside it where they apply. */
const COVER_ACTION_IDS = ['fetchCover', 'removeCover'] as const satisfies readonly ActionId[];

/** The row or card of the table that shows `rowId`, if it is on the page. */
function findRowElement(rowId: string | undefined): HTMLElement | null {
  if (!rowId) return null;
  return document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"]`);
}

type PreviewStepButtonProps = {
  label: string;
  bindings: readonly ShortcutBinding[];
  /** The bookmark it shows; none at the end of the rows, where the button is disabled. */
  target: Bookmark | undefined;
  onShow: (bookmark: Bookmark) => void;
  children: React.ReactNode;
};

/** Previous or Next: disabled at the end of the rows, but focusable, so focus stays on it there. */
function PreviewStepButton({ label, bindings, target, onShow, children }: PreviewStepButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="data-disabled:pointer-events-none data-disabled:opacity-50"
      aria-label={label}
      aria-keyshortcuts={ariaKeyShortcuts(bindings)}
      title={label}
      disabled={!target}
      focusableWhenDisabled
      onClick={() => {
        if (target) onShow(target);
      }}
    >
      {children}
    </Button>
  );
}

export function BookmarkPreviewDialog({
  bookmark,
  rows,
  host,
  onShow,
  onClose,
}: BookmarkPreviewDialogProps) {
  // The last bookmark stays drawn while the dialog closes, so its content does not vanish first.
  const shownRef = useRef(bookmark);
  if (bookmark) shownRef.current = bookmark;
  const shown = bookmark ?? shownRef.current;
  // A button's action, run once the preview has closed.
  const pendingActionRef = useRef<(() => void) | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const { value: metadataById } = useStoredValue(bookmarkMetadataValue);

  const metadata = shown ? metadataById[shown.id] : undefined;
  const coverInfo = useCoverInfo(shown?.id ?? '', shown?.url);
  const coverSource = describeCoverSource(coverInfo);
  // The cover's own commands, as the item menu offers them.
  const coverActions = shown
    ? COVER_ACTION_IDS.filter((id) => isItemMenuActionAvailable(id, [shown], host))
    : [];
  const tags = metadata?.tags ?? [];
  const summary = metadata?.summary?.trim() ?? '';
  const sections = shown ? getItemMenuSections([shown], host, ACTION_MENUS.preview) : [];
  const [primaryAction] = sections.flat();
  const neighbors: PreviewNeighbors = shown ? previewNeighbors(rows, shown.id) : {};
  // Nothing to step to on a page with one bookmark.
  const canStep = rows.filter(isPreviewableBookmark).length > 1;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = findShortcut(event.nativeEvent, managerPreview, { allowWithOverlay: true });
    const target = step ? neighbors[step] : undefined;
    if (!target) return;
    event.preventDefault();
    onShow(target);
  };

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
        className="max-h-dialog-screen overflow-y-auto sm:max-w-xl"
        // Before the controls inside: a disabled button keeps focus but swallows its keys.
        onKeyDownCapture={handleKeyDown}
      >
        {shown ? (
          <>
            {/* Room on the right for the close button. */}
            <div className="flex min-w-0 items-start gap-2 pr-6">
              <DialogHeader className="min-w-0 flex-1">
                <DialogTitle className="leading-snug [overflow-wrap:anywhere]">
                  {shown.title.trim() || t('popup_untitled')}
                </DialogTitle>
                <DialogDescription className="[overflow-wrap:anywhere]">
                  {shown.url ? <UrlLink href={shown.url} /> : null}
                </DialogDescription>
              </DialogHeader>
              {canStep ? (
                <div className="-mt-1.5 flex shrink-0 gap-1" data-testid="bookmark-preview-steps">
                  <PreviewStepButton
                    label={t('bookmarks_previewPrevious')}
                    bindings={managerPreview.previous}
                    target={neighbors.previous}
                    onShow={onShow}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </PreviewStepButton>
                  <PreviewStepButton
                    label={t('bookmarks_previewNext')}
                    bindings={managerPreview.next}
                    target={neighbors.next}
                    onShow={onShow}
                  >
                    <ChevronRight aria-hidden="true" />
                  </PreviewStepButton>
                </div>
              ) : null}
            </div>
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
              {coverSource || coverActions.length > 0 ? (
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{t('covers_sourceLabel')}</dt>
                  <dd className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    {coverSource ? (
                      <span data-testid="bookmark-preview-cover-source">{coverSource}</span>
                    ) : null}
                    {/* The cover's own commands, so a cover can be fetched or removed here. */}
                    <span className="flex flex-wrap gap-1">
                      {coverActions.map((id) => {
                        const { icon } = getAction(id);
                        const Icon = icon ? ACTION_ICONS[icon] : undefined;
                        return (
                          <Button
                            key={id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-action={id}
                            onClick={() => runItemMenuAction(id, [shown], host)}
                          >
                            {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
                            {getItemMenuLabel(id, [shown], host)}
                          </Button>
                        );
                      })}
                    </span>
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
