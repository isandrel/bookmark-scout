import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Bookmark } from '@/components/ui/table/columns';
import { t } from '@/hooks/use-i18n';
import { getBookmarkFolderPath } from '@/services/bookmarks';

type BookmarkDetailsDialogProps = {
  bookmark: Bookmark | null;
  onClose: () => void;
  onOpenFolder: (id: string) => void;
};

function DetailField({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className="break-words text-sm">
        {children}
      </dd>
    </div>
  );
}

function DateValue({ value }: { value?: number }) {
  const date = typeof value === 'number' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return t('bookmarks_detailsUnavailable');
  return <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>;
}

function isWebUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function BookmarkDetailsContent({
  bookmark,
  onClose,
  onOpenFolder,
}: {
  bookmark: Bookmark;
  onClose: () => void;
  onOpenFolder: (id: string) => void;
}) {
  const [folderPath, setFolderPath] = useState<string[] | null>(null);
  const [pathError, setPathError] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    let active = true;
    getBookmarkFolderPath(bookmark.parentId)
      .then((path) => {
        if (active) setFolderPath(path);
      })
      .catch(() => {
        if (active) setPathError(true);
      });
    return () => {
      active = false;
    };
  }, [bookmark.parentId]);

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(t('bookmarks_detailsCopied'));
    } catch {
      setCopyStatus(t('bookmarks_detailsCopyFailed'));
    }
  };
  const bookmarkUrl = bookmark.url;

  return (
    <>
      <dl className="space-y-4">
        <DetailField label={t('bookmarks_detailsName')} testId="bookmark-details-name">
          {bookmark.title || t('bookmarks_untitled')}
        </DetailField>
        <DetailField label={t('bookmarks_detailsUrl')} testId="bookmark-details-url">
          <span className="break-all">{bookmark.url || t('bookmarks_detailsUnavailable')}</span>
        </DetailField>
        <DetailField label={t('bookmarks_detailsFolderPath')} testId="bookmark-details-path">
          {pathError
            ? t('bookmarks_detailsPathUnavailable')
            : folderPath === null
              ? t('bookmarks_detailsLoadingPath')
              : [
                  t('bookmarks_root'),
                  ...folderPath.map((name) => name || t('bookmarks_untitled')),
                ].join(' / ')}
        </DetailField>
        <DetailField label={t('bookmarks_detailsDateAdded')} testId="bookmark-details-added">
          <DateValue value={bookmark.dateAdded} />
        </DetailField>
        <DetailField label={t('bookmarks_detailsDateModified')} testId="bookmark-details-modified">
          <DateValue value={bookmark.dateGroupModified} />
        </DetailField>
        <DetailField label={t('bookmarks_detailsId')} testId="bookmark-details-id">
          {bookmark.id}
        </DetailField>
      </dl>
      <DialogFooter className="gap-2 sm:justify-start">
        {bookmarkUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyValue(bookmarkUrl)}
          >
            {t('bookmarks_detailsCopyUrl')}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => copyValue(bookmark.id)}>
          {t('bookmarks_detailsCopyId')}
        </Button>
        {isWebUrl(bookmarkUrl) ? (
          <Button asChild variant="outline" size="sm">
            <a href={bookmarkUrl} target="_blank" rel="noopener noreferrer">
              {t('bookmarks_detailsOpenLink')}
            </a>
          </Button>
        ) : null}
        {!bookmarkUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenFolder(bookmark.id);
              onClose();
            }}
          >
            {t('bookmarks_detailsOpenFolder')}
          </Button>
        ) : null}
      </DialogFooter>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {copyStatus}
      </p>
    </>
  );
}

export function BookmarkDetailsDialog({
  bookmark,
  onClose,
  onOpenFolder,
}: BookmarkDetailsDialogProps) {
  return (
    <Dialog
      open={bookmark !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bookmarks_detailsTitle')}</DialogTitle>
          <DialogDescription>{t('bookmarks_detailsDescription')}</DialogDescription>
        </DialogHeader>
        {bookmark ? (
          <BookmarkDetailsContent
            key={bookmark.id}
            bookmark={bookmark}
            onClose={onClose}
            onOpenFolder={onOpenFolder}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
