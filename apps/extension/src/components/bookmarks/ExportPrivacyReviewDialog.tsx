type ExportPrivacyReviewDialogProps = {
  /** Bookmarks with possibly private values; `null` keeps the dialog closed. */
  items: ExportPrivacyItem[] | null;
  onCancel: () => void;
  onExportOriginal: () => void;
  onExportRedacted: () => void;
};

function describeExportPrivacyField(field: ExportPrivacyField): string {
  switch (field.kind) {
    case 'queryParam':
      return t('tools_privacySensitiveParam', field.name ?? '');
    case 'fragmentParam':
      return t('tools_privacySensitiveFragmentParam', field.name ?? '');
    case 'fragment':
      return t('export_privacyFragment');
    case 'credentials':
      return t('export_privacyCredentials');
    case 'token':
      if (field.location === 'title') return t('export_privacyTokenTitle');
      return field.name ? t('export_privacyTokenParam', field.name) : t('export_privacyTokenUrl');
    case 'email':
      if (field.location === 'title') return t('export_privacyEmailTitle');
      return field.name ? t('export_privacyEmailParam', field.name) : t('export_privacyEmailUrl');
  }
}

/** Shown before an export or AI context download that contains possibly private values. */
export function ExportPrivacyReviewDialog({
  items,
  onCancel,
  onExportOriginal,
  onExportRedacted,
}: ExportPrivacyReviewDialogProps) {
  return (
    <Dialog
      open={items !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('export_privacyReviewTitle')}</DialogTitle>
          <DialogDescription>
            {tPlural('export_privacyReviewDesc', items?.length ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {items?.map((item) => (
            <li key={item.id} className="space-y-1 rounded-lg border p-3">
              <div className="text-sm font-medium break-words">
                {item.title.trim() || t('bookmarks_untitled')}
              </div>
              <div className="text-xs text-muted-foreground break-all">{item.url}</div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {item.fields.map((field) => (
                  <li key={`${field.kind}:${field.location}:${field.name ?? ''}`}>
                    {describeExportPrivacyField(field)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t('action_cancel')}
          </Button>
          <Button variant="outline" onClick={onExportOriginal}>
            {t('export_privacyReviewOriginal')}
          </Button>
          <Button onClick={onExportRedacted}>{t('export_privacyReviewRedacted')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
