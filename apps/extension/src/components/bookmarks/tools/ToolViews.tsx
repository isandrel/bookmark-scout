/**
 * How each tool in `TOOL_DEFINITIONS` shows its run: its review (`ToolReviews.lazy.tsx`, loaded on
 * first use) and extra card controls.
 */
import { lazy, Suspense, useEffect, useState } from 'react';

export type ToolReviewProps<Id extends ToolId> = {
  tool: ToolDefinitions[Id];
  state: ToolRunState<ToolResults[Id]>;
  apply: (selection: ToolSelections[Id]) => Promise<void>;
  undo: () => void;
  close: () => void;
  /** The page's tree, and its reload for reviews that change bookmarks on their own. */
  environment: ToolEnvironment;
};

const ToolReviewView = lazy(() =>
  import('./ToolReviews.lazy').then((module) => ({ default: module.ToolReviewView })),
);

/**
 * A tool's review (`ToolReviews.lazy.tsx`), loaded the first time the tool runs, so the manager
 * starts without the review dialogs and the list they share.
 */
export function ToolReview(props: ToolReviewProps<ToolId>) {
  const used = props.state.open || props.state.phase !== 'idle';
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (used) setLoaded(true);
  }, [used]);
  // Once loaded it stays mounted, so closing animates out and reopening is instant.
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <ToolReviewView {...props} />
    </Suspense>
  );
}

/**
 * The quick way to real icons, offered above Refresh Site Icons while the browser's icon cache is
 * not in use (Chrome and Edge): the icons the browser already saved, behind the mild "Read the
 * icons of the websites you visit" prompt instead of access to every bookmarked website.
 */
function BrowserIconsOffer() {
  const inUse = useEffectiveSetting('browserIconCache');
  const { setValue } = useSetting('browserIconCache');
  const gate = usePermissionGate('browserIcons');
  if (inUse || !isPermissionFeatureSupported('browserIcons', currentBrowser())) {
    return null;
  }
  return (
    <div
      className="flex w-full flex-col items-start gap-2 rounded-md bg-muted/60 p-2"
      data-testid="browser-icons-offer"
    >
      <p className="text-xs text-muted-foreground">{t('perm_browserIconsOffer')}</p>
      <Button size="sm" className="h-8 text-xs" onClick={() => void gate.run(() => setValue(true))}>
        {t('perm_browserIconsUse')}
      </Button>
      <PermissionDialog {...gate.dialogProps} />
    </div>
  );
}

/** The saved site icon count and size, and a button that clears them. */
function SiteIconCacheControls() {
  const siteIconCache = useSiteIconCacheSummary();
  const [clearing, setClearing] = useState(false);
  const clear = async () => {
    setClearing(true);
    try {
      await clearSiteIconCache();
      toast.success({
        title: t('toast_siteIconsCleared'),
        description: t('toast_siteIconsClearedDesc'),
      });
    } catch (error) {
      toast.error({ title: t('toast_toolFailed'), description: getErrorMessage(error) });
    } finally {
      setClearing(false);
    }
  };
  return (
    <>
      <BrowserIconsOffer />
      {/* Its own width first, so a long count line moves the button to the next line instead of
          wrapping itself into a narrow column. */}
      <span className="min-w-0 flex-auto text-xs text-muted-foreground">
        {tPlural('tools_siteIconsCached', siteIconCache.count, [
          formatKilobytes(siteIconCache.bytes),
        ])}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-8 text-xs"
        onClick={clear}
        disabled={siteIconCache.count === 0 || clearing}
      >
        {t('tools_siteIconsClear')}
      </Button>
    </>
  );
}

/** Tool-specific controls shown on a card above its scope selector. */
export const TOOL_CONTROLS: Partial<Record<ToolId, () => React.ReactNode>> = {
  siteIcons: SiteIconCacheControls,
};
