/**
 * Every permission the extension declares, per browser, and every feature that asks for an
 * optional one at runtime. `manifest.config.ts` builds each manifest from these tables and
 * `services/permissions.ts` checks and requests from them, so the two cannot disagree.
 *
 * Pure data and pure functions only: no browser APIs and no auto-imported names, because the
 * manifest build reads this file outside the extension. Store reviewers see the result, so keep
 * `store/permissions.md` and the privacy documents in step with any change here.
 */

export type PermissionBrowser = 'chrome' | 'edge' | 'firefox';

/** `required` is granted at install; `optional` is asked for by a feature below. */
type PermissionGrant = 'required' | 'optional';

/**
 * API permissions per browser. A browser left out does not declare the permission (Firefox
 * rejects the Chromium-only ones). Firefox cannot make `contextMenus` or `storage` optional.
 */
export const API_PERMISSIONS = {
  bookmarks: { chrome: 'required', edge: 'required', firefox: 'required' },
  storage: { chrome: 'required', edge: 'required', firefox: 'required' },
  // No warning. The toolbar popup and context-menu clicks get the current page through it.
  activeTab: { chrome: 'required', edge: 'required', firefox: 'required' },
  // No warning, and a side panel granted at runtime is only registered after a reload.
  sidePanel: { chrome: 'required', edge: 'required' },
  tabs: { chrome: 'optional', edge: 'optional', firefox: 'optional' },
  favicon: { chrome: 'optional', edge: 'optional' },
  contextMenus: { chrome: 'optional', edge: 'optional', firefox: 'required' },
} as const satisfies Record<string, Partial<Record<PermissionBrowser, PermissionGrant>>>;

export type ApiPermission = keyof typeof API_PERMISSIONS;

/** Website access: bookmarks can point to any site, so a narrower pattern is not possible. */
export const WEB_ORIGINS = ['http://*/*', 'https://*/*'] as const;

/**
 * Firefox's built-in data collection consent categories this extension can ask for. Data counts
 * as collected when it leaves the browser, including to an AI provider the user picks.
 */
export type DataCollectionCategory =
  | 'authenticationInfo'
  | 'bookmarksInfo'
  | 'browsingActivity'
  | 'websiteContent';

/**
 * What the AI features send to the provider the user chose: the API key (authenticationInfo),
 * bookmark titles, URLs, and folder paths (bookmarksInfo), the current page's URL
 * (browsingActivity), and its title or text (websiteContent).
 */
const AI_DATA_COLLECTION: readonly DataCollectionCategory[] = [
  'authenticationInfo',
  'bookmarksInfo',
  'browsingActivity',
  'websiteContent',
];

export type PermissionFeatureDefinition = {
  /** API permissions the feature needs; only the optional ones are requested. */
  permissions?: readonly ApiPermission[];
  /** Host patterns the feature needs. */
  origins?: readonly string[];
  /** Firefox data collection categories; other browsers have no such consent. */
  dataCollection?: readonly DataCollectionCategory[];
  /**
   * Shown before the browser's own prompt, where that prompt alone does not say why ("Read your
   * browsing history"). Without it the request runs straight from the click.
   */
  explanation?: { titleKey: string; descriptionKey: string; detailKey: string };
  /** Toast shown when the user declines; the feature stays off and nothing retries. */
  denied: { titleKey: string; descriptionKey: string };
};

/** Every feature that needs a permission the browser may not have granted yet. */
export const PERMISSION_FEATURES = {
  /** Right-click "Save to folder": turning on Context Menu in Settings. */
  contextMenu: {
    permissions: ['contextMenus'],
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_contextMenuDenied' },
  },
  /** Reading the current page where the browser gives no activeTab (the side panel). */
  currentTab: {
    permissions: ['tabs'],
    explanation: {
      titleKey: 'permission_currentTabTitle',
      descriptionKey: 'permission_currentTabDesc',
      detailKey: 'permission_currentTabDetail',
    },
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_currentTabDenied' },
  },
  /** Icons from the browser's own cache: turning on Use the browser's icon cache. */
  browserIcons: {
    permissions: ['favicon'],
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_browserIconsDenied' },
  },
  /** Check Dead Links, Metadata Fetcher, and Refresh Site Icons request bookmarked pages. */
  webAccess: {
    origins: WEB_ORIGINS,
    explanation: {
      titleKey: 'tools_hostAccessTitle',
      descriptionKey: 'tools_hostAccessDesc',
      detailKey: 'tools_hostAccessPrivacy',
    },
    denied: { titleKey: 'tools_hostAccessDenied', descriptionKey: 'tools_hostAccessDeniedDesc' },
  },
  /** Read page content: downloads pages and sends their text to the AI provider. */
  pageReading: {
    origins: WEB_ORIGINS,
    dataCollection: AI_DATA_COLLECTION,
    denied: { titleKey: 'tools_hostAccessDenied', descriptionKey: 'settings_hostAccessDeniedDesc' },
  },
  /** Every AI feature that sends bookmarks or the current page to the provider. */
  ai: {
    dataCollection: AI_DATA_COLLECTION,
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_aiDenied' },
  },
  /** Verify Service and Refresh Models send only the API key to the provider. */
  aiProviderCheck: {
    dataCollection: ['authenticationInfo'],
    denied: {
      titleKey: 'permission_deniedTitle',
      descriptionKey: 'permission_aiProviderCheckDenied',
    },
  },
} as const satisfies Record<string, PermissionFeatureDefinition>;

export type PermissionFeature = keyof typeof PERMISSION_FEATURES;

/** The `permissions.request` / `contains` argument, including Firefox's `data_collection`. */
export type PermissionRequest = {
  permissions?: string[];
  origins?: string[];
  data_collection?: DataCollectionCategory[];
};

function featureDefinition(feature: PermissionFeature): PermissionFeatureDefinition {
  return PERMISSION_FEATURES[feature];
}

/** False where the browser lacks one of the feature's permissions (the icon cache in Firefox). */
export function isPermissionFeatureSupported(
  feature: PermissionFeature,
  browser: PermissionBrowser,
): boolean {
  return (featureDefinition(feature).permissions ?? []).every(
    (permission) =>
      (API_PERMISSIONS[permission] as Partial<Record<PermissionBrowser, PermissionGrant>>)[
        browser
      ] !== undefined,
  );
}

/**
 * What `feature` has to ask `browser` for, plus any `extraOrigins` (one AI provider's address).
 * Null when nothing: every part is granted at install there.
 */
export function getPermissionRequest(
  feature: PermissionFeature,
  browser: PermissionBrowser,
  extraOrigins: readonly string[] = [],
): PermissionRequest | null {
  const definition = featureDefinition(feature);
  const permissions = (definition.permissions ?? []).filter(
    (permission) =>
      (API_PERMISSIONS[permission] as Partial<Record<PermissionBrowser, PermissionGrant>>)[
        browser
      ] === 'optional',
  );
  const origins = [...(definition.origins ?? []), ...extraOrigins];
  const dataCollection = browser === 'firefox' ? [...(definition.dataCollection ?? [])] : [];
  const request: PermissionRequest = {
    ...(permissions.length > 0 ? { permissions: [...permissions] } : {}),
    ...(origins.length > 0 ? { origins } : {}),
    ...(dataCollection.length > 0 ? { data_collection: dataCollection } : {}),
  };
  return Object.keys(request).length > 0 ? request : null;
}

/** The manifest's `permissions` and `optional_permissions` (API names only) for `browser`. */
export function getManifestApiPermissions(browser: PermissionBrowser): {
  permissions: ApiPermission[];
  optional: ApiPermission[];
} {
  const entries = Object.entries(API_PERMISSIONS) as [
    ApiPermission,
    Partial<Record<PermissionBrowser, PermissionGrant>>,
  ][];
  return {
    permissions: entries
      .filter(([, grants]) => grants[browser] === 'required')
      .map(([name]) => name),
    optional: entries.filter(([, grants]) => grants[browser] === 'optional').map(([name]) => name),
  };
}

/**
 * Firefox's `data_collection_permissions`: nothing at install, and every category a feature asks
 * for listed as optional, since an optional category can only be granted if it is declared.
 */
export function getFirefoxDataCollectionPermissions(): {
  required: ['none'];
  optional: DataCollectionCategory[];
} {
  const optional = new Set<DataCollectionCategory>();
  for (const definition of Object.values(PERMISSION_FEATURES) as PermissionFeatureDefinition[]) {
    for (const category of definition.dataCollection ?? []) optional.add(category);
  }
  return { required: ['none'], optional: [...optional].sort() };
}
