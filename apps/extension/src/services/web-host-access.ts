/**
 * Optional host access for the network tools. Without it, extension pages are subject to
 * CORS and most sites cannot be checked. The permission is optional (declared in
 * `optional_host_permissions`) and requested only from a user click.
 */

export const WEB_HOST_ORIGINS = ['http://*/*', 'https://*/*'];

export async function hasWebHostAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: WEB_HOST_ORIGINS });
  } catch {
    return false;
  }
}

/**
 * Must be called synchronously from a click handler (before any `await`); Firefox rejects
 * requests that are not tied to user input. Resolves `false` when the user declines.
 */
export function requestWebHostAccess(): Promise<boolean> {
  try {
    return browser.permissions.request({ origins: WEB_HOST_ORIGINS }).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
