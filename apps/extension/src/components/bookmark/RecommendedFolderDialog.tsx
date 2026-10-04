import { ChevronRight, FolderPlus, Loader2 } from 'lucide-react';
import { useEffect } from 'react';

type RecommendedFolderDialogProps = {
  recommendation: FolderRecommendation | null;
  /** The recommendation resolved against the current tree; the dialog is open while it is set. */
  path: ResolvedFolderPath | null;
  bookmark: { title: string; url: string } | null;
  isSaving: boolean;
  /** Why the last save failed, shown in the dialog where no toast can cover its buttons. */
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/** Earlier outcome toasts sit over the dialog's buttons in a short popup; Undo toasts stay. */
function useDismissInformationalToasts(open: boolean) {
  const { toasts, dismiss } = useToast();
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the toasts shown when it opens.
  useEffect(() => {
    if (!open) return;
    for (const item of toasts) {
      if (!item.action && item.open !== false) dismiss(item.id);
    }
  }, [open]);
}

export function RecommendedFolderDialog({
  recommendation,
  path,
  bookmark,
  isSaving,
  error,
  onOpenChange,
  onConfirm,
}: RecommendedFolderDialogProps) {
  const open = Boolean(recommendation && path && bookmark);
  useDismissInformationalToasts(open);

  if (!recommendation || !path || !bookmark) {
    return null;
  }

  // Each folder on its own, so a title that contains "/" cannot pass for two folders.
  const titles = [...path.existingTitles, ...path.newTitles];
  const segments = titles.map((title, depth) => ({
    title,
    isNew: depth >= path.existingTitles.length,
    // Titles can repeat along a path; the titles down to this folder name it uniquely.
    key: JSON.stringify(titles.slice(0, depth + 1)),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-ai" />
            {t('ai_newFolderReviewTitle')}
          </DialogTitle>
          <DialogDescription>{t('ai_newFolderReviewDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t('ai_newFolderPathLabel')}
            </div>
            <ol
              aria-label={t('ai_newFolderPathLabel')}
              data-testid="recommended-folder-path"
              className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 font-medium"
            >
              {segments.map((segment, index) => (
                <li
                  key={segment.key}
                  data-slot="path-segment"
                  data-new={segment.isNew ? '' : undefined}
                  className="flex min-w-0 items-center gap-1"
                >
                  {index > 0 && (
                    <ChevronRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="min-w-0 [overflow-wrap:anywhere]">{segment.title}</span>
                  {segment.isNew && (
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-ai">
                      {t('ai_newFolderPathNew')}
                    </Badge>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t('ai_currentPageLabel')}
            </div>
            <div className="mt-1 break-words font-medium">{bookmark.title}</div>
            <div className="mt-1 break-all text-xs text-muted-foreground">{bookmark.url}</div>
          </div>
          <p className="text-xs text-muted-foreground">{recommendation.reason}</p>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/50 bg-destructive/10 p-3"
            >
              <p className="font-medium">{t('ai_newFolderFailed')}</p>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('action_cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('ai_newFolderSaving')}
              </>
            ) : (
              t('ai_newFolderConfirm')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
