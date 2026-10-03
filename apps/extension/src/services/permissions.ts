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
 * `hooks/use-permission.tsx` wraps these for pages: `usePermission` and `usePermissionGate`.
 */

/** The browser this build is for, as the permission tables name it. */
export const CURRENT_PERMISSION_BROWSER = import.meta.env.BROWSER as PermissionBrowser;

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
  if (!isPermissionFeatureSupported(feature, CURRENT_PERMISSION_BROWSER)) return false;
  const request = getPermissionRequest(feature, CURRENT_PERMISSION_BROWSER);
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
  if (!isPermissionFeatureSupported(feature, CURRENT_PERMISSION_BROWSER)) {
    return Promise.resolve(false);
  }
  const request = getPermissionRequest(feature, CURRENT_PERMISSION_BROWSER, extraOrigins);
  if (!request) return Promise.resolve(true);
  try {
    return browser.permissions
      .request(request as Browser.permissions.Permissions)
      .catch(() => false);
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

/** Shows the toast for a declined request; the feature stays off. */
export function notifyPermissionDenied(feature: PermissionFeature): void {
  const { denied } = PERMISSION_FEATURES[feature];
  toast.error({ title: t(denied.titleKey), description: t(denied.descriptionKey) });
}
