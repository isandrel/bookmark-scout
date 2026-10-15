import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

/**
 * Permission state for pages, shared by every component on the page: one browser listener and
 * one check per feature, however many rows ask (each bookmark icon reads `browserIcons`).
 */
const grants = new Map<PermissionFeature, boolean | null>();
const subscribers = new Set<() => void>();
let stopWatching: (() => void) | undefined;

/** Granted when the feature needs nothing at runtime in this browser; null until checked. */
function initialGrant(feature: PermissionFeature): boolean | null {
  if (!isPermissionFeatureSupported(feature, CURRENT_PERMISSION_BROWSER)) return false;
  return getPermissionRequest(feature, CURRENT_PERMISSION_BROWSER) ? null : true;
}

/** The known state, or the state before any check. */
function readGrant(feature: PermissionFeature): boolean | null {
  return grants.has(feature) ? (grants.get(feature) ?? null) : initialGrant(feature);
}

async function refreshGrant(feature: PermissionFeature): Promise<boolean> {
  const granted = await hasPermission(feature);
  if (grants.get(feature) !== granted) {
    grants.set(feature, granted);
    for (const notify of subscribers) notify();
  }
  return granted;
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  stopWatching ??= watchPermissions(() => {
    for (const feature of grants.keys()) void refreshGrant(feature);
  });
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      stopWatching?.();
      stopWatching = undefined;
      grants.clear();
    }
  };
}

/**
 * Whether `feature` has its permission, following later grants and revokes (including ones made
 * in the browser's own settings). `granted` is null until the first check finishes; a missing
 * feature counts as granted.
 */
export function usePermission(feature: PermissionFeature | undefined): {
  granted: boolean | null;
  recheck: () => Promise<boolean>;
} {
  const read = () => (feature ? readGrant(feature) : true);
  // The same snapshot serves server rendering (unit tests render components to a string).
  const granted = useSyncExternalStore(subscribe, read, read);

  useEffect(() => {
    if (!feature || grants.has(feature)) return;
    grants.set(feature, initialGrant(feature));
    void refreshGrant(feature);
  }, [feature]);

  const recheck = useCallback(async () => (feature ? refreshGrant(feature) : true), [feature]);
  return { granted, recheck };
}

/**
 * A setting as it takes effect: a switch that needs a permission counts as off while the
 * permission is missing. The stored value is left alone (see `services/permissions.ts`).
 */
export function useEffectiveSetting<K extends keyof Settings>(key: K): Settings[K] {
  const { value } = useSetting(key);
  const { granted } = usePermission(getSettingPermission(key));
  return (value === true && granted !== true ? false : value) as Settings[K];
}

const SETTING_FEATURES = [...new Set(Object.values(SETTING_PERMISSIONS))];

/** `values` with every permission-gated switch shown as it takes effect (`useEffectiveSetting`). */
export function useEffectiveSettings(values: Settings): Settings {
  // One string snapshot, so the store can be read for every feature at once.
  const read = () => SETTING_FEATURES.map((feature) => String(readGrant(feature))).join();
  const snapshot = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    for (const feature of SETTING_FEATURES) {
      if (grants.has(feature)) continue;
      grants.set(feature, initialGrant(feature));
      void refreshGrant(feature);
    }
  }, []);
  return useMemo(() => {
    const granted = new Map(
      SETTING_FEATURES.map((feature, index) => [feature, snapshot.split(',')[index] === 'true']),
    );
    const shown = { ...values };
    for (const [key, feature] of Object.entries(SETTING_PERMISSIONS)) {
      const settingKey = key as keyof typeof SETTING_PERMISSIONS;
      if (shown[settingKey] === true && !granted.get(feature)) shown[settingKey] = false;
    }
    return shown;
  }, [snapshot, values]);
}

type GateOptions = {
  /**
   * Run first and ask only when the work throws `PermissionRequiredError` for this feature: the
   * page may already have what it needs another way (the toolbar popup's activeTab).
   */
  tryFirst?: boolean;
};

/** Shows the toast for a declined request; the feature stays off. */
export function notifyPermissionDenied(feature: PermissionFeature): void {
  const { denied } = PERMISSION_FEATURES[feature];
  toast.error({ title: t(denied.titleKey), description: t(denied.descriptionKey) });
}

/** Whether `feature` explains itself in `PermissionDialog` before the browser's prompt. */
function hasExplanation(feature: PermissionFeature): boolean {
  return Boolean((PERMISSION_FEATURES[feature] as PermissionFeatureDefinition).explanation);
}

/** Work waiting on the explanation dialog, and the sites it needs (null: all websites). */
type PendingRun = {
  start: () => Promise<unknown>;
  sites?: { names: string[]; origins: string[] | null };
};

/**
 * Runs work that needs `feature`: at once when granted, otherwise after asking. A feature with an
 * explanation opens `PermissionDialog` first and requests from its Allow button; others request
 * straight from the click. A declined request shows a toast and leaves the work undone, and
 * nothing asks again until the user does.
 *
 * Website access can be narrowed per run: `run(start, sites)` with the sites the run will
 * request (`getUrlSites`) asks for just those, or for all websites when there are more than
 * `SITE_ACCESS_MAX_SITES` (`lib/site-access.ts`). Only for features with an explanation, since
 * checking what is granted takes an await and the dialog's Allow is then the click.
 */
export function usePermissionGate(
  feature: PermissionFeature,
  { tryFirst = false }: GateOptions = {},
) {
  const { granted, recheck } = usePermission(feature);
  const [pending, setPending] = useState<PendingRun | null>(null);

  const requestThenRun = useCallback(
    async ({ start, sites }: PendingRun) => {
      // First, inside the click, so Firefox treats the request as user input.
      const request = sites?.origins
        ? requestSiteAccess(feature, sites.origins)
        : requestPermission(feature);
      const allowed = await request;
      await recheck();
      if (!allowed) {
        notifyPermissionDenied(feature);
        return;
      }
      await start();
    },
    [feature, recheck],
  );

  const ask = useCallback(
    (run: PendingRun) => {
      if (hasExplanation(feature)) {
        setPending(run);
      } else {
        void requestThenRun(run);
      }
    },
    [feature, requestThenRun],
  );

  /**
   * Runs `start` now, or asks first; resolves `start`'s result, or undefined when it asked.
   * `sites` narrows website access to the sites the run will request.
   */
  const run = useCallback(
    async <T,>(start: () => Promise<T>, sites?: readonly string[]): Promise<T | undefined> => {
      if (granted) return start();
      // Clicked before the first check finished: with an explanation to show, the dialog's Allow
      // is the click the request runs in, so checking first loses nothing.
      if (granted === null && hasExplanation(feature) && (await recheck())) return start();
      if (sites) {
        const origins = getSiteAccessOrigins(sites);
        if (origins && (await hasSiteAccess(feature, origins))) return start();
        ask({ start, sites: { names: [...sites], origins } });
        return undefined;
      }
      if (!tryFirst) {
        ask({ start });
        return undefined;
      }
      try {
        return await start();
      } catch (error) {
        if (!(error instanceof PermissionRequiredError) || error.feature !== feature) throw error;
        ask({ start });
        return undefined;
      }
    },
    [ask, feature, granted, recheck, tryFirst],
  );

  return {
    granted,
    run,
    dialogProps: {
      feature,
      open: pending !== null,
      sites: pending?.sites ? (pending.sites.origins ? pending.sites.names : 'all') : undefined,
      onAllow: () => {
        const waiting = pending;
        setPending(null);
        if (waiting) void requestThenRun(waiting);
      },
      onCancel: () => setPending(null),
    } satisfies PermissionDialogProps,
  };
}
