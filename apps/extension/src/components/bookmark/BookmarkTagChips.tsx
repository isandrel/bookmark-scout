/**
 * A bookmark's stored tags as outline pill chips, up to `max`, then one "+N" chip whose tooltip and
 * screen-reader text name the rest. Shared by the manager's cards, its Tags column, and the hover
 * card, so the three show tags alike.
 */

type BookmarkTagChipsProps = {
  tags: readonly string[];
  /** Chips shown before the "+N" chip. */
  max: number;
  /** Wrap onto more lines (cards, hover card), or stay on one line and clip (a table cell). */
  wrap?: boolean;
};

export function BookmarkTagChips({ tags, max, wrap = true }: BookmarkTagChipsProps) {
  const shown = tags.slice(0, max);
  const hidden = tags.slice(max);
  const moreLabel = hidden.length
    ? tPlural('bookmarks_cardMoreTagsLabel', hidden.length, [formatList(hidden)])
    : '';
  return (
    <ul
      aria-label={t('bookmarks_metadataTags')}
      data-testid="bookmark-tags"
      className={cn('flex min-w-0 gap-1', wrap ? 'flex-wrap' : 'flex-nowrap overflow-hidden')}
    >
      {shown.map((tag) => (
        <li key={tag} className={cn('min-w-0', wrap ? 'max-w-full' : 'shrink')}>
          <Badge variant="outline" className="max-w-full px-2 font-normal" title={tag}>
            <span className="truncate">{tag}</span>
          </Badge>
        </li>
      ))}
      {hidden.length ? (
        <li className="shrink-0">
          <Badge variant="secondary" className="px-2 font-normal" title={moreLabel}>
            <span aria-hidden="true">{t('bookmarks_cardMoreTags', String(hidden.length))}</span>
            <span className="sr-only">{moreLabel}</span>
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}
