/**
 * Actions for the manager's row selection: move to another folder, or delete with undo.
 * Items inside a selected folder are handled by that folder, not moved or deleted twice.
 */

import { FolderInput, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

type BookmarkBulkActionsProps = {
  /** Selected rows visible under the current filters; the only rows actions apply to. */
  selected: Bookmark[];
  /** Selected rows hidden by filters; reported, never moved or deleted. */
  hiddenCount: number;
  allData: Bookmark[];
  onDelete: (items: Bookmark[]) => void;
  onClearSelection: () => void;
};

export function BookmarkBulkActions({
  selected,
  hiddenCount,
  allData,
  onDelete,
  onClearSelection,
}: BookmarkBulkActionsProps) {
  const { toast } = useToast();
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [moving, setMoving] = useState(false);

  const modifiable = useMemo(() => selected.filter(isModifiableBookmark), [selected]);
  const items = useMemo(() => pruneNestedSelection(modifiable, allData), [allData, modifiable]);
  // Selected items inside a selected folder travel with that folder instead of on their own.
  const nestedCount = modifiable.length - items.length;
  const targets = useMemo(() => {
    const allowed = new Set(getMoveTargetFolders(items, allData).map((folder) => folder.id));
    return buildFolderOptions(allData, t('bookmarks_untitled')).filter((option) =>
      allowed.has(option.value),
    );
  }, [allData, items]);

  const moveSelection = async () => {
    if (!targetId) return;
    setMoving(true);
    let moved = 0;
    try {
      for (const item of items) {
        await moveBookmark(item.id, { parentId: targetId });
        moved += 1;
      }
      toast({
        title: `✓ ${moved === 1 ? t('bookmarks_bulkMovedOne') : t('bookmarks_bulkMoved', String(moved))}`,
        variant: 'success',
      });
      setMoveOpen(false);
      onClearSelection();
    } catch (error) {
      toast({
        title: `× ${t('toast_errorMovingItem')}`,
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setMoving(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
      data-testid="bulk-actions"
      role="toolbar"
      aria-label={t('bookmarks_bulkActions')}
    >
      <span className="font-medium">{t('table_filterSelectedCount', String(selected.length))}</span>
      {hiddenCount > 0 && (
        <span className="text-muted-foreground" data-testid="bulk-hidden-selection">
          {t('bookmarks_bulkHiddenSelection', String(hiddenCount))}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={items.length === 0}
        onClick={() => {
          setTargetId('');
          setMoveOpen(true);
        }}
      >
        <FolderInput />
        {t('bookmarks_bulkMove')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-destructive-text hover:text-destructive-text"
        disabled={items.length === 0}
        onClick={() => onDelete(items)}
      >
        <Trash2 />
        {t('table_delete')}
      </Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={onClearSelection}>
        <X />
        {t('bookmarks_clearSelection')}
      </Button>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {items.length === 1
                ? t('bookmarks_bulkMoveTitleOne')
                : t('bookmarks_bulkMoveTitle', String(items.length))}
            </DialogTitle>
            <DialogDescription>{t('bookmarks_bulkMoveDescription')}</DialogDescription>
          </DialogHeader>
          <BulkItemPreview items={items} />
          {nestedCount > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="bulk-nested-note">
              {t('bookmarks_bulkNestedIncluded', String(nestedCount))}
            </p>
          )}
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger aria-label={t('bookmarks_bulkMoveTarget')}>
              <SelectValue placeholder={t('bookmarks_bulkMoveTarget')} />
            </SelectTrigger>
            <SelectContent>
              {targets.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              {t('action_cancel')}
            </Button>
            <Button disabled={!targetId || moving} onClick={moveSelection}>
              {t('bookmarks_bulkMove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
