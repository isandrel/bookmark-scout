import { Folder, Link } from 'lucide-react';

const PREVIEW_LIMIT = 8;

type BulkItemPreviewProps = {
  /** `type` is 'folder' for folders; anything else shows as a link. */
  items: { id: string; title: string; type: string }[];
};

/** Names the items a bulk move or delete will act on, so the count is never the only clue. */
export function BulkItemPreview({ items }: BulkItemPreviewProps) {
  const shown = items.slice(0, PREVIEW_LIMIT);
  const remaining = items.length - shown.length;
  return (
    <ul
      className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-sm"
      data-testid="bulk-item-preview"
    >
      {shown.map((item) => (
        <li key={item.id} className="flex min-w-0 items-center gap-2">
          {item.type === 'folder' ? (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <Link className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate">{item.title.trim() || t('bookmarks_untitled')}</span>
        </li>
      ))}
      {remaining > 0 && (
        <li className="text-muted-foreground">
          {t('bookmarks_bulkPreviewMore', String(remaining))}
        </li>
      )}
    </ul>
  );
}
