import { FolderPlus, Loader2 } from 'lucide-react';

type RecommendedFolderDialogProps = {
  open: boolean;
  recommendation: FolderRecommendation | null;
  bookmark: { title: string; url: string } | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function RecommendedFolderDialog({
  open,
  recommendation,
  bookmark,
  isSaving,
  onOpenChange,
  onConfirm,
}: RecommendedFolderDialogProps) {
  if (!recommendation || !bookmark) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-violet-500" />
            {t('ai_newFolderReviewTitle')}
          </DialogTitle>
          <DialogDescription>{t('ai_newFolderReviewDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t('ai_newFolderPathLabel')}
            </div>
            <div className="mt-1 break-words font-medium">{recommendation.folderPath}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t('ai_currentPageLabel')}
            </div>
            <div className="mt-1 break-words font-medium">{bookmark.title}</div>
            <div className="mt-1 break-all text-xs text-muted-foreground">{bookmark.url}</div>
          </div>
          <p className="text-xs text-muted-foreground">{recommendation.reason}</p>
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
