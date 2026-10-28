/**
 * A bookmark's preview in the manager, opened from its item menu (Preview) or with the manager's
 * preview key on a focused row or card: its title and address, then the details Options > Behavior >
 * Preview shows, in its order (the stored cover, folder, tags, summary, and where the cover came
 * from, with Fetch cover and Remove cover beside it), then the buttons of `[menus] preview` in
 * config/ui/actions.toml as the user arranged them. Everything comes from this device; nothing is
 * fetched, so without a stored cover none is shown.
 *
 * Previous and Next (and the preview's keys, `managerPreview` from `usePageShortcuts`, unless
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
  const { managerPreview } = usePageShortcuts();
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
  const previewMenu = useManagerMenu('preview');
  // Which details show, in what order (Options > Behavior > Preview).
  const { value: storedFields } = useSetting('previewFields');
  const fields = getPreviewFields(storedFields);
  const sections = shown ? getItemMenuSections([shown], host, previewMenu) : [];
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
            {/* The details Options > Behavior > Preview shows, in its order. */}
            <div className="grid min-w-0 gap-3 text-sm">
              {fields.map((field) => {
                switch (field) {
                  case 'cover':
                    return shown.url ? (
                      <BookmarkCover key={field} bookmarkId={shown.id} url={shown.url} />
                    ) : null;
                  case 'folder':
                    return (
                      <PreviewDetail key={field} label={t('bookmarks_detailsFolderPath')}>
                        <span
                          className="flex min-w-0 items-start gap-2"
                          data-testid="bookmark-preview-folder"
                        >
                          <Folder
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {shown.folderPath}
                          </span>
                        </span>
                      </PreviewDetail>
                    );
                  case 'tags':
                    return tags.length > 0 ? (
                      <PreviewDetail key={field} label={t('bookmarks_metadataTags')}>
                        <ul className="flex flex-wrap gap-1.5" data-testid="bookmark-preview-tags">
                          {tags.map((tag) => (
                            <li key={tag}>
                              <Badge variant="outline" className="font-normal">
                                {tag}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </PreviewDetail>
                    ) : null;
                  case 'summary':
                    return summary ? (
                      <PreviewDetail key={field} label={t('bookmarks_metadataSummary')}>
                        <span
                          className="block whitespace-pre-line [overflow-wrap:anywhere]"
                          data-testid="bookmark-preview-summary"
                        >
                          {summary}
                        </span>
                      </PreviewDetail>
                    ) : null;
                  case 'coverSource':
                    return coverSource || coverActions.length > 0 ? (
                      <PreviewDetail
                        key={field}
                        label={t('covers_sourceLabel')}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"
                      >
                        {coverSource ? (
                          <span data-testid="bookmark-preview-cover-source">{coverSource}</span>
                        ) : null}
                        {/* The cover's own commands, so a cover can be fetched or removed here. */}
                        <DialogActions className="flex flex-wrap gap-1">
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
                        </DialogActions>
                      </PreviewDetail>
                    ) : null;
                  default:
                    return null;
                }
              })}
            </div>
            <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-start sm:space-x-0">
              {sections.map((section, index) => (
                // A gap between the sections the preview's buttons are arranged in.
                <span key={section.join()} className="contents">
                  {index > 0 ? (
                    <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
                  ) : null}
                  {section.map((id) => {
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
                </span>
              ))}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** One detail of the preview: its name, then its value. */
function PreviewDetail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={className}>{children}</dd>
    </dl>
  );
}
