/**
 * The list a tool's review shows its items in, the same for every tool: category tabs with
 * counts, a checkbox per item and one for every item shown, "Set selected to…" for the batch
 * actions, and one action per item; a review of one item shows only its action. Only the rows on screen are drawn, so a review of thousands
 * of bookmarks stays fast. What the categories and actions are, and what each row shows, comes
 * from the tool (`ReviewListProps`); the choices themselves are kept by the caller.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { z } from 'zod';

const reviewConfig = readConfig(
  'ui/tool-review',
  z.strictObject({
    row_estimate_px: z.number().int().positive(),
    overscan_rows: z.number().int().nonnegative(),
    defaults: z.strictObject({
      url_cleaner: z.enum(['clean', 'keep']),
      metadata_fetcher: z.enum(['apply', 'skip']),
      site_icons: z.enum(['save', 'skip']),
      ai_metadata: z.enum(['save', 'skip']),
      privacy_scanner: z.enum(['keep', 'delete']),
      bookmark_rules: z.enum(['apply', 'skip']),
      page_text: z.enum(['save', 'skip']),
      covers: z.enum(['save', 'skip']),
      stored_covers: z.enum(['keep', 'delete']),
    }),
  }),
);

/** What each tool's review starts its items on (`[defaults]` in config/ui/tool-review.toml). */
export const REVIEW_DEFAULT_ACTIONS = reviewConfig.defaults;

export type ReviewListProps<Item, Category extends string, Action extends string> = {
  items: readonly Item[];
  idOf: (item: Item) => string;
  /** The categories in tab order; one with no items has no tab. */
  categories: readonly Category[];
  categoryOf: (item: Item) => Category;
  /** A tab's text, with how many items it has. */
  categoryLabel: (category: Category, count: number) => string;
  /** The actions one item offers, in menu order. */
  actionsOf: (item: Item) => readonly Action[];
  actionLabel: (action: Action) => string;
  /** The actions "Set selected to…" offers; each is set on the selected items that offer it. */
  batchActions: readonly Action[];
  /** Each item's chosen action, by id. */
  actionOf: (item: Item) => Action;
  onAction: (ids: readonly string[], action: Action) => void;
  /** The item's title, accessible name of its checkbox and action menu. */
  titleOf: (item: Item) => string;
  /** What a row shows under its title: compact lines, and controls for its action. */
  renderDetails: (item: Item) => React.ReactNode;
  /** Badges at the end of a row's title line. */
  renderBadges?: (item: Item) => React.ReactNode;
  disabled?: boolean;
  /** `data-testid` of each row. */
  rowTestId: string;
};

export function ReviewList<Item, Category extends string, Action extends string>({
  items,
  idOf,
  categories,
  categoryOf,
  categoryLabel,
  actionsOf,
  actionLabel,
  batchActions,
  actionOf,
  onAction,
  titleOf,
  renderDetails,
  renderBadges,
  disabled = false,
  rowTestId,
}: ReviewListProps<Item, Category, Action>) {
  const [category, setCategory] = useState<CategoryFilter<Category>>(ALL_CATEGORIES);
  const ids = useMemo(() => items.map(idOf), [items, idOf]);
  const noneSelected = useMemo<string[]>(() => [], []);
  const { selected, toggle, setMany } = useIdSelection(noneSelected);
  const shown = useMemo(
    () => inCategory(items, category, categoryOf),
    [items, category, categoryOf],
  );
  const shownIds = category === ALL_CATEGORIES ? ids : shown.map(idOf);
  const selectedShown = shownIds.filter((id) => selected.has(id));
  // One item has nothing to sort or choose in bulk: its own action is the whole review, so a
  // checkbox beside it only looked like it decided what is applied.
  const many = items.length > 1;

  const setSelected = (action: Action) =>
    onAction(
      shown
        .filter((item) => selected.has(idOf(item)) && actionsOf(item).includes(action))
        .map(idOf),
      action,
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3" data-slot="review-list">
      {many && (
        <CategoryTabs
          items={items}
          categories={categories}
          categoryOf={categoryOf}
          categoryLabel={categoryLabel}
          value={category}
          onValueChange={setCategory}
        />
      )}
      <div
        data-slot="review-batch"
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs',
          !many && 'hidden',
        )}
      >
        <Checkbox
          checked={selectedShown.length > 0 && selectedShown.length === shownIds.length}
          indeterminate={selectedShown.length > 0 && selectedShown.length < shownIds.length}
          onCheckedChange={(checked) => setMany(shownIds, checked === true)}
          aria-label={t('review_selectShown')}
          disabled={disabled || shownIds.length === 0}
        />
        <span className="text-muted-foreground">
          {t('review_selectedCount', String(selectedShown.length))}
        </span>
        <ActionSelect
          className="ml-auto w-full sm:w-56"
          actions={batchActions}
          actionLabel={actionLabel}
          label={t('review_setSelected')}
          placeholder={t('review_setSelected')}
          disabled={disabled || selectedShown.length === 0}
          onAction={setSelected}
        />
      </div>
      {/* One list per tab: a tab starts at its top, measured afresh, never at the scroll
          position or row sizes another tab left behind. */}
      <ReviewRows key={category} items={shown} idOf={idOf} rowTestId={rowTestId}>
        {(item) => {
          const id = idOf(item);
          const title = titleOf(item);
          return (
            <div className="flex min-w-0 gap-3 rounded-lg border p-3 text-sm">
              {many && (
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(id)}
                  onCheckedChange={(checked) => toggle(id, checked === true)}
                  aria-label={t('review_selectItem', title)}
                  disabled={disabled}
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium" title={title}>
                    {title}
                  </span>
                  {renderBadges ? (
                    <div className="flex shrink-0 items-center gap-1">{renderBadges(item)}</div>
                  ) : null}
                </div>
                {renderDetails(item)}
              </div>
              <ActionSelect
                className="w-40 shrink-0 self-start"
                actions={actionsOf(item)}
                actionLabel={actionLabel}
                label={t('review_itemAction', title)}
                value={actionOf(item)}
                disabled={disabled}
                onAction={(action) => onAction([id], action)}
              />
            </div>
          );
        }}
      </ReviewRows>
    </div>
  );
}

/** The rows of one tab, drawn only while on screen, in their own scroll area. */
function ReviewRows<Item>({
  items,
  idOf,
  rowTestId,
  children,
}: {
  items: readonly Item[];
  idOf: (item: Item) => string;
  rowTestId: string;
  children: (item: Item) => React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => reviewConfig.row_estimate_px,
    overscan: reviewConfig.overscan_rows,
    getItemKey: (index) => idOf(items[index]),
  });
  return (
    <div
      ref={scrollRef}
      data-slot="review-scroll"
      className="max-h-dialog-list-short min-h-0 overflow-x-hidden overflow-y-auto"
    >
      <ul className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => (
          <li
            key={row.key}
            data-index={row.index}
            data-testid={rowTestId}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full pb-2"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {children(items[row.index])}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A menu of actions: the item's chosen one, or a placeholder for a batch. */
function ActionSelect<Action extends string>({
  actions,
  actionLabel,
  label,
  value = null,
  placeholder,
  disabled,
  className,
  onAction,
}: {
  actions: readonly Action[];
  actionLabel: (action: Action) => string;
  label: string;
  value?: Action | null;
  placeholder?: string;
  disabled: boolean;
  className: string;
  onAction: (action: Action) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onAction(next as Action);
      }}
      items={actions.map((action) => ({ value: action, label: actionLabel(action) }))}
      disabled={disabled}
    >
      <SelectTrigger className={cn('h-8 text-xs', className)} aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {actions.map((action) => (
          <SelectItem key={action} value={action}>
            {actionLabel(action)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
