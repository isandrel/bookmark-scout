/**
 * A bookmark row of the popup tree, with drag and drop and its action buttons
 * (`PopupRowButtons`). Render it inside a `PopupTreeProvider`.
 */

export function BookmarkRow({ row }: { row: PopupTreeRow }) {
  const { favicon, rowRef, draggingId } = usePopupTree();
  const { node } = row;
  const onLinkClick = useLinkClick();
  // A Firefox separator: a line, not a link to its `data:` address.
  const separator = isSeparatorNode(node);
  const searchReason = searchReasonLabel(node.searchMatchReasons);
  // The hover card shows the whole title and address, so the plain tooltip would repeat it.
  const { value: hoverDetails } = useSetting('showHoverDetails');
  // Where a click on the row goes; the icon for it shows with the row's hover actions.
  const linkTarget = useLinkTarget();
  const openable = !separator && isOpenableUrl(node.url);

  return (
    // At least one icon-button tall; a larger site icon grows the row instead of touching the next.
    <div className="group bookmark-item relative flex min-h-(--popup-tree-row) items-center rounded-md px-2 py-(--popup-tree-row-pad) transition-colors duration-150 hover:bg-muted focus-within:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring">
      <a
        ref={rowRef(node, 'bookmark')}
        href={separator ? undefined : node.url}
        role="treeitem"
        aria-label={separator ? t('table_typeSeparator') : undefined}
        aria-description={openable ? linkTarget?.label : undefined}
        aria-level={row.level}
        aria-posinset={row.posInSet}
        aria-setsize={row.setSize}
        {...{
          [POPUP_TREE_ROW_ID_ATTRIBUTE]: node.id,
          [POPUP_TREE_ROW_ATTRIBUTE]: 'bookmark',
        }}
        // Long titles are cut off, so hovering shows the whole title and where the link goes.
        title={separator || hoverDetails ? undefined : bookmarkRowTooltip(node)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (!separator && isOpenableUrl(node.url)) onLinkClick(event, node.url);
        }}
        data-slot="drag-handle"
        className={cn(
          'flex min-w-0 flex-1 cursor-grab items-center focus-visible:outline-none active:cursor-grabbing',
          draggingId === node.id && 'dragging',
        )}
      >
        {/* Empty chevron slot, so the icon and title line up with folders at the same depth. */}
        <span aria-hidden="true" data-slot="tree-indent" className="mr-1 size-4 shrink-0" />
        {separator ? (
          <span aria-hidden="true" data-slot="tree-separator" className="h-px flex-1 bg-border" />
        ) : null}
        {!separator && favicon.show && (
          <SiteIcon
            url={node.url ?? ''}
            size={favicon.size}
            className="mr-2 shrink-0 rounded-sm bookmark-favicon"
          />
        )}
        {separator ? null : node.title.trim() ? (
          <HighlightedText
            showTitle={false}
            className="truncate text-sm"
            text={node.title}
            ranges={node.searchMatchRanges}
          />
        ) : (
          <span className="truncate text-sm italic text-muted-foreground">
            {getBookmarkDisplayTitle(node.title)}
          </span>
        )}
        {searchReason ? (
          <span
            data-slot="search-reason"
            className="ml-2 max-w-1/2 shrink-0 truncate text-xs text-muted-foreground"
          >
            {searchReason}
          </span>
        ) : null}
      </a>
      {/* Overlays the row's end only while hovered or focused, like the folder actions. */}
      <div
        data-slot="bookmark-actions"
        className="pointer-events-none absolute inset-y-0.5 right-0.5 flex items-center gap-0.5 rounded-r-sm bg-muted px-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:bg-accent group-focus-within:opacity-100 [&>button]:pointer-events-auto"
      >
        {openable ? <LinkTargetIcon decorative className="mx-1" /> : null}
        <PopupRowButtons kind="bookmark" node={node} />
      </div>
    </div>
  );
}
