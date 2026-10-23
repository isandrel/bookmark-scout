export type PermissionDialogProps = {
  feature: PermissionFeature;
  open: boolean;
  /**
   * For website access narrowed to one run: the sites the browser will ask for, or `all` when
   * the run covers too many sites and asks for all websites.
   */
  sites?: readonly string[] | 'all';
  onAllow: () => void;
  onCancel: () => void;
};

/**
 * Extra content for a feature's explanation, between the description and the detail. The tab
 * permission's dialog first lists the ways to save the current page that need no permission.
 */
const EXPLANATION_EXTRAS: Partial<Record<PermissionFeature, () => React.ReactNode>> = {
  currentTab: CurrentPageWithoutTabAccess,
};

/** What the browser will ask for when access is narrowed to a run's sites. */
function siteAccessLine(sites: readonly string[] | 'all'): string {
  if (sites === 'all') return t('perm_siteAccessAll', String(SITE_ACCESS_MAX_SITES));
  return tPlural('perm_siteAccessSome', sites.length, [
    formatListPreview(sites, SITE_ACCESS_LISTED_SITES),
  ]);
}

/**
 * Explains an optional permission before the browser's own prompt, for features whose prompt
 * alone does not say why it is needed. `usePermissionGate` opens it and requests from Allow.
 */
export function PermissionDialog({
  feature,
  open,
  sites,
  onAllow,
  onCancel,
}: PermissionDialogProps) {
  const explanation = (PERMISSION_FEATURES[feature] as PermissionFeatureDefinition).explanation;
  if (!explanation) return null;
  const Extra = EXPLANATION_EXTRAS[feature];
  // Only where the browser also asks for data collection consent (Firefox).
  const asksDataCollection = Boolean(getCurrentPermissionRequest(feature)?.data_collection?.length);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" data-permission-feature={feature}>
        <DialogHeader>
          <DialogTitle>{t(explanation.titleKey)}</DialogTitle>
          <DialogDescription>{t(explanation.descriptionKey)}</DialogDescription>
        </DialogHeader>
        {Extra ? <Extra /> : null}
        <p className="text-sm text-muted-foreground">{t(explanation.detailKey)}</p>
        {sites ? <p className="text-sm text-muted-foreground">{siteAccessLine(sites)}</p> : null}
        {asksDataCollection && explanation.dataCollectionNoteKey ? (
          <p className="text-sm text-muted-foreground">{t(explanation.dataCollectionNoteKey)}</p>
        ) : null}
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

/**
 * The ways to save the page you are on without the tab permission: the toolbar popup (activeTab)
 * and the quick save shortcut, with the keys the browser actually assigned.
 */
function CurrentPageWithoutTabAccess() {
  const { shortcuts } = useCommandShortcuts();
  const keys = shortcuts?.['quick-save'];
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="permission-alternatives">
      <li>{t('perm_currentTabUsePopup')}</li>
      {keys ? (
        <li>
          {t(
            'perm_currentTabUseShortcut',
            formatCommandShortcut(keys, { apple: isApplePlatform() }),
          )}
        </li>
      ) : null}
    </ul>
  );
}
