/**
 * Category tabs for a review: All, then each category with items, each with its count. Kept apart
 * from `ReviewList`, which loads with a tool's review, so result views can use them at start.
 */
import { useId } from 'react';

/** The tab that shows every item. */
export const ALL_CATEGORIES = 'all';
export type CategoryFilter<Category extends string> = Category | typeof ALL_CATEGORIES;

/** The items a category tab shows. */
export function inCategory<Item, Category extends string>(
  items: readonly Item[],
  category: CategoryFilter<Category>,
  categoryOf: (item: Item) => Category,
): readonly Item[] {
  return category === ALL_CATEGORIES
    ? items
    : items.filter((item) => categoryOf(item) === category);
}

/** Tabs for All and each category with items, each with its count. */
export function CategoryTabs<Item, Category extends string>({
  items,
  categories,
  categoryOf,
  categoryLabel,
  value,
  onValueChange,
}: {
  items: readonly Item[];
  /** The categories in tab order; one with no items has no tab. */
  categories: readonly Category[];
  categoryOf: (item: Item) => Category;
  /** A tab's text, with how many items it has. */
  categoryLabel: (category: Category, count: number) => string;
  value: CategoryFilter<Category>;
  onValueChange: (value: CategoryFilter<Category>) => void;
}) {
  const labelId = useId();
  const counts = new Map<Category, number>();
  for (const item of items) {
    const key = categoryOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (
    <>
      <span id={labelId} className="sr-only">
        {t('review_categoryLabel')}
      </span>
      <SegmentedControl
        aria-labelledby={labelId}
        value={value}
        options={[
          { value: ALL_CATEGORIES, label: t('review_categoryAll', String(items.length)) },
          ...categories
            .filter((key) => counts.has(key))
            .map((key) => ({ value: key, label: categoryLabel(key, counts.get(key) ?? 0) })),
        ]}
        className="h-auto flex-wrap self-start"
        onValueChange={(next) => onValueChange(next as CategoryFilter<Category>)}
      />
    </>
  );
}
