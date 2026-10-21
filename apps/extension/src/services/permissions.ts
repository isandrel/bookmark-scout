/**
 * Runtime checks and requests for the optional permissions in `lib/permission-catalog.ts`.
 *
 * Rules every caller follows:
 * - `requestPermission` runs first thing in a click handler, before any `await`: Firefox only
 *   accepts a request made synchronously from user input, and an awaited `contains` loses it.
 * - A declined request leaves the feature off; nothing asks again on its own.
 * - A feature works only while its setting is on and its permission is granted. Revoking the
 *   permission turns the feature off without rewriting the synced setting, so a revoke on one
 *   device does not switch the feature off on another where it is still granted.
 *
 * `hooks/use-permission.tsx` wraps these for pages: `usePermission`, `usePermissionGate`, and
 * `notifyPermissionDenied`. This file stays free of UI code: the background imports it.
 */

/** What `feature` has to ask this browser for (`getPermissionRequest`), or null when nothing. */
export function getCurrentPermissionRequest(
  feature: PermissionFeature,
  extraOrigins: readonly string[] = [],
): PermissionRequest | null {
  return getPermissionRequest(feature, currentBrowser(), {
    extraOrigins,
    dataCollectionConsent: browserProfile().dataCollectionConsent,
  });
}

/** Thrown when a feature runs without the permission it needs; the message says what is missing. */
export class PermissionRequiredError extends Error {
  readonly feature: PermissionFeature;

  constructor(feature: PermissionFeature) {
    super(t(PERMISSION_FEATURES[feature].denied.descriptionKey));
    this.name = 'PermissionRequiredError';
    this.feature = feature;
  }
}

/** True when the feature can run in this browser and every part it needs is granted. */
export async function hasPermission(feature: PermissionFeature): Promise<boolean> {
  if (!isPermissionFeatureSupported(feature, currentBrowser())) return false;
  const request = getCurrentPermissionRequest(feature);
  if (!request) return true;
  try {
    return await browser.permissions.contains(request as Browser.permissions.Permissions);
  } catch {
    return false;
  }
}

/** Throws `PermissionRequiredError` unless `hasPermission(feature)`. */
export async function assertPermission(feature: PermissionFeature): Promise<void> {
  if (!(await hasPermission(feature))) throw new PermissionRequiredError(feature);
}

/**
 * Asks the browser for what `feature` needs, plus `extraOrigins`. Call it synchronously from a
 * click handler. Resolves true when granted (at once, without a prompt, when nothing is missing),
 * false when the user declines or the browser refuses.
 */
export function requestPermission(
  feature: PermissionFeature,
  extraOrigins: readonly string[] = [],
): Promise<boolean> {
  if (!isPermissionFeatureSupported(feature, currentBrowser())) {
    return Promise.resolve(false);
  }
  const request = getCurrentPermissionRequest(feature, extraOrigins);
  if (!request) return Promise.resolve(true);
  try {
    return browser.permissions
      .request(request as Browser.permissions.Permissions)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * `feature`'s request with its website access narrowed to `origins` (`lib/site-access.ts`), or
 * null when that leaves nothing to ask for.
 */
function siteAccessRequest(
  feature: PermissionFeature,
  origins: readonly string[],
): Browser.permissions.Permissions | null {
  const { origins: _declared, ...rest } = getCurrentPermissionRequest(feature) ?? {};
  const request = { ...rest, ...(origins.length > 0 ? { origins: [...origins] } : {}) };
  return Object.keys(request).length > 0 ? (request as Browser.permissions.Permissions) : null;
}

/** Like `hasPermission`, for a run that needs only `origins` (a subset of the feature's own). */
export async function hasSiteAccess(
  feature: PermissionFeature,
  origins: readonly string[],
): Promise<boolean> {
  if (!isPermissionFeatureSupported(feature, currentBrowser())) return false;
  const request = siteAccessRequest(feature, origins);
  if (!request) return true;
  try {
    return await browser.permissions.contains(request);
  } catch {
    return false;
  }
}

/**
 * Like `requestPermission`, asking only for `origins` instead of all the websites the feature
 * declares, so the browser's prompt names those sites. Call it synchronously from a click.
 */
export function requestSiteAccess(
  feature: PermissionFeature,
  origins: readonly string[],
): Promise<boolean> {
  if (!isPermissionFeatureSupported(feature, currentBrowser())) {
    return Promise.resolve(false);
  }
  const request = siteAccessRequest(feature, origins);
  if (!request) return Promise.resolve(true);
  try {
    return browser.permissions.request(request).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Calls `listener` after any grant or revoke, from any page or the browser's own settings. */
export function watchPermissions(listener: () => void): () => void {
  const events = browser.permissions;
  const handler = () => listener();
  events?.onAdded?.addListener(handler);
  events?.onRemoved?.addListener(handler);
  return () => {
    events?.onAdded?.removeListener(handler);
    events?.onRemoved?.removeListener(handler);
  };
}
