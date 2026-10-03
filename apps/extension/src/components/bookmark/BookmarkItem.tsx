/**
 * BookmarkItem component.
 * Renders a single bookmark row of the popup tree, with drag-and-drop and delete.
 */

import { Trash2 } from 'lucide-react';
import type { BookmarkTreeNode } from '@/types';

export function BookmarkItem({ node }: { node: BookmarkTreeNode }) {
  const { favicon, rowRef, draggingId, onDeleteBookmark } = usePopupTree();

  return (
    <div className="group bookmark-item relative flex h-8 items-center rounded-md px-2 py-1 transition-colors duration-150 hover:bg-muted focus-within:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring">
      <a
        ref={rowRef(node, 'bookmark')}
        href={node.url}
        data-popup-tree-row="bookmark"
        target="_blank"
        rel="noopener noreferrer"
        data-slot="drag-handle"
        className={cn(
          'flex min-w-0 flex-1 cursor-grab items-center focus-visible:outline-none active:cursor-grabbing',
          draggingId === node.id && 'dragging',
        )}
      >
        {/* Empty chevron slot, so the icon and title line up with folders at the same depth. */}
        <span aria-hidden="true" data-slot="tree-indent" className="mr-1 size-4 shrink-0" />
        {favicon.show && (
          <SiteIcon
            url={node.url ?? ''}
            size={favicon.size}
            className="mr-2 shrink-0 rounded-sm bookmark-favicon"
          />
        )}
        {node.title.trim() ? (
          <HighlightedText
            className="truncate text-sm"
            text={node.title}
            ranges={node.searchMatchRanges}
          />
        ) : (
          <span className="truncate text-sm italic text-muted-foreground">
            {getBookmarkDisplayTitle(node.title)}
          </span>
        )}
      </a>
      {/* Overlays the row's end only while hovered or focused, like the folder actions. */}
      <div
        data-slot="bookmark-actions"
        className="pointer-events-none absolute inset-y-0.5 right-0.5 flex items-center rounded-r-sm bg-muted px-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:bg-accent group-focus-within:opacity-100"
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="pointer-events-auto text-destructive-text hover:bg-destructive-wash hover:text-destructive-text"
          onClick={() => onDeleteBookmark(node)}
          title={t('popup_deleteBookmark')}
          aria-label={t('popup_deleteBookmark')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
