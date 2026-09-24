import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  getStoredBookmarkMetadata,
  removeStoredBookmarkMetadata,
  saveBookmarkMetadata,
} from '@/lib/bookmark-metadata-storage';
import { cn } from '@/lib/utils';
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
  const [tagsText, setTagsText] = useState('');
  const [summary, setSummary] = useState('');
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataStatus, setMetadataStatus] = useState('');

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

  useEffect(() => {
    let active = true;
    setMetadataLoading(true);
    getStoredBookmarkMetadata([bookmark.id])
      .then((metadata) => {
        if (!active) return;
        setTagsText(metadata[bookmark.id]?.tags?.join(', ') ?? '');
        setSummary(metadata[bookmark.id]?.summary ?? '');
      })
      .catch(() => {
        if (active) setMetadataStatus(t('bookmarks_metadataLoadFailed'));
      })
      .finally(() => {
        if (active) setMetadataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookmark.id]);

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(t('bookmarks_detailsCopied'));
    } catch {
      setCopyStatus(t('bookmarks_detailsCopyFailed'));
    }
  };
  const bookmarkUrl = bookmark.url;

  const saveMetadata = async () => {
    setMetadataSaving(true);
    setMetadataStatus('');
    try {
      const tags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
      await saveBookmarkMetadata(bookmark.id, { tags, summary });
      const stored = await getStoredBookmarkMetadata([bookmark.id]);
      setTagsText(stored[bookmark.id]?.tags?.join(', ') ?? '');
      setSummary(stored[bookmark.id]?.summary ?? '');
      setMetadataStatus(t('bookmarks_metadataSaved'));
    } catch {
      setMetadataStatus(t('bookmarks_metadataSaveFailed'));
    } finally {
      setMetadataSaving(false);
    }
  };

  const clearMetadata = async () => {
    setMetadataSaving(true);
    setMetadataStatus('');
    try {
      await removeStoredBookmarkMetadata([bookmark.id]);
      setTagsText('');
      setSummary('');
      setMetadataStatus(t('bookmarks_metadataCleared'));
    } catch {
      setMetadataStatus(t('bookmarks_metadataSaveFailed'));
    } finally {
      setMetadataSaving(false);
    }
  };

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
      {bookmarkUrl ? (
        <section className="space-y-4 rounded-lg border p-4" aria-label={t('bookmarks_metadataTitle')}>
          <div>
            <h3 className="text-sm font-semibold">{t('bookmarks_metadataTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('bookmarks_metadataDescription')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`bookmark-tags-${bookmark.id}`}>{t('bookmarks_metadataTags')}</Label>
            <Input
              id={`bookmark-tags-${bookmark.id}`}
              data-testid="bookmark-metadata-tags"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder={t('bookmarks_metadataTagsPlaceholder')}
              disabled={metadataLoading || metadataSaving}
            />
            <p className="text-xs text-muted-foreground">{t('bookmarks_metadataTagsHelp')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`bookmark-summary-${bookmark.id}`}>
              {t('bookmarks_metadataSummary')}
            </Label>
            <textarea
              id={`bookmark-summary-${bookmark.id}`}
              data-testid="bookmark-metadata-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t('bookmarks_metadataSummaryPlaceholder')}
              disabled={metadataLoading || metadataSaving}
              className={cn(
                'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={saveMetadata}
              disabled={metadataLoading || metadataSaving}
            >
              {metadataSaving ? t('action_saving') : t('bookmarks_metadataSave')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearMetadata}
              disabled={metadataLoading || metadataSaving || (!tagsText && !summary)}
            >
              {t('bookmarks_metadataClear')}
            </Button>
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {metadataStatus}
          </p>
        </section>
      ) : null}
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
