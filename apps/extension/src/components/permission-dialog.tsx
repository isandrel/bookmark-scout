/**
 * Explains an optional permission before the browser's own prompt, for features whose prompt
 * alone does not say why it is needed. `usePermissionGate` opens it and requests from Allow.
 */
export function PermissionDialog({
  feature,
  open,
  onAllow,
  onCancel,
}: {
  feature: PermissionFeature;
  open: boolean;
  onAllow: () => void;
  onCancel: () => void;
}) {
  const explanation = (PERMISSION_FEATURES[feature] as PermissionFeatureDefinition).explanation;
  if (!explanation) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(explanation.titleKey)}</DialogTitle>
          <DialogDescription>{t(explanation.descriptionKey)}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t(explanation.detailKey)}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('action_notNow')}
          </Button>
          <Button onClick={onAllow}>{t('action_allowAccess')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
