/**
 * Every permission the extension declares, per browser, and every feature that asks for an
 * optional one at runtime. `manifest.config.ts` builds each manifest from these tables and
 * `services/permissions.ts` checks and requests from them, so the two cannot disagree.
 *
 * Pure data and pure functions only: no browser APIs and no auto-imported names, because the
 * manifest build reads this file outside the extension. Store reviewers see the result, so keep
 * `store/permissions.md` and the privacy documents in step with any change here.
 */

import type { SupportedBrowser } from './supported-browsers';

export type { SupportedBrowser };

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
  // No warning. Quick save shows its notification in the tab the shortcut was pressed in, which
  // activeTab opens to the extension for that moment only.
  scripting: { chrome: 'required', edge: 'required', firefox: 'required' },
  // No warning. AI quick save runs the AI request and page reading in an offscreen document,
  // because a service worker cannot load the AI SDK or parse HTML. Firefox's background is a page.
  offscreen: { chrome: 'required', edge: 'required' },
  tabs: { chrome: 'optional', edge: 'optional', firefox: 'optional' },
  favicon: { chrome: 'optional', edge: 'optional' },
  contextMenus: { chrome: 'optional', edge: 'optional', firefox: 'required' },
  // "Communicate with cooperating native applications": only for access for local AI agents.
  nativeMessaging: { chrome: 'optional', edge: 'optional', firefox: 'optional' },
} as const satisfies Record<string, Partial<Record<SupportedBrowser, PermissionGrant>>>;

export type ApiPermission = keyof typeof API_PERMISSIONS;

/**
 * Website access as declared: bookmarks can point to any site. A run over known bookmarks asks
 * for just their sites, a subset of these (`lib/site-access.ts`).
 */
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
 * What turning on AI lets the AI features send to the provider the user chose: the API key
 * (authenticationInfo), bookmark titles, URLs, and folder paths (bookmarksInfo), and the current
 * page's title and URL, as the browser's history would hold them (browsingActivity). Page text
 * (websiteContent) is asked for only when the user turns on Read page content.
 */
const AI_DATA_COLLECTION: readonly DataCollectionCategory[] = [
  'authenticationInfo',
  'bookmarksInfo',
  'browsingActivity',
];

/**
 * Said before Firefox's data collection prompt, which names "the extension developer" as the one
 * collecting: here that is the AI provider the user chose.
 */
const AI_DATA_COLLECTION_NOTE_KEY = 'perm_aiFirefoxNote';

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
   * `dataCollectionNoteKey` is added where the browser also asks for data collection consent
   * (Firefox), to say who really receives the data.
   */
  explanation?: {
    titleKey: string;
    descriptionKey: string;
    detailKey: string;
    dataCollectionNoteKey?: string;
  };
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
  /**
   * Reading the current page where the browser gives no activeTab (the side panel). The dialog
   * first offers the ways that need no permission (the toolbar popup, the quick save shortcut).
   */
  currentTab: {
    permissions: ['tabs'],
    explanation: {
      titleKey: 'perm_currentTabTitle',
      descriptionKey: 'perm_currentTabDesc',
      detailKey: 'perm_currentTabDetail',
    },
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_currentTabDenied' },
  },
  /**
   * Icons from the browser's own cache: turning on Use the browser's icon cache, or Show browser
   * icons on Refresh Site Icons. Its prompt ("Read the icons of the websites you visit") is far
   * milder than the website access Refresh Site Icons needs, so it is offered first.
   */
  browserIcons: {
    permissions: ['favicon'],
    explanation: {
      titleKey: 'perm_browserIconsTitle',
      descriptionKey: 'perm_browserIconsDesc',
      detailKey: 'perm_browserIconsDetail',
    },
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
  /**
   * Read page content: downloads pages and sends their text to the AI provider. It reads pages
   * the user did not pick one by one (Auto-Tagging runs, Ask AI, AI quick save), so it asks for
   * all websites; the other AI data is covered by `ai`.
   */
  pageReading: {
    origins: WEB_ORIGINS,
    dataCollection: ['websiteContent'],
    explanation: {
      titleKey: 'permission_pageReadingTitle',
      descriptionKey: 'permission_pageReadingDesc',
      detailKey: 'permission_pageReadingDetail',
      dataCollectionNoteKey: AI_DATA_COLLECTION_NOTE_KEY,
    },
    denied: { titleKey: 'tools_hostAccessDenied', descriptionKey: 'settings_hostAccessDeniedDesc' },
  },
  /** Every AI feature that sends bookmarks or the current page to the provider. */
  ai: {
    dataCollection: AI_DATA_COLLECTION,
    // Firefox's consent prompt says only that "the developer" wants to collect these categories,
    // which reads as if Bookmark Scout receives them; the dialog says where the data really goes.
    explanation: {
      titleKey: 'permission_aiTitle',
      descriptionKey: 'permission_aiDesc',
      detailKey: 'permission_aiDetail',
      dataCollectionNoteKey: AI_DATA_COLLECTION_NOTE_KEY,
    },
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_aiDenied' },
  },
  /**
   * Access for local AI agents: the bridge program the user installed (`packages/mcp-bridge`)
   * passes bookmark titles, URLs, and folder paths, and the current page's title and URL to the
   * AI agents the user runs on this computer; page text only while Read page content is on and
   * allowed (`pageReading`, which asks for website content itself).
   */
  agentBridge: {
    permissions: ['nativeMessaging'],
    dataCollection: ['bookmarksInfo', 'browsingActivity'],
    explanation: {
      titleKey: 'permission_agentBridgeTitle',
      descriptionKey: 'permission_agentBridgeDesc',
      detailKey: 'permission_agentBridgeDetail',
      dataCollectionNoteKey: 'perm_agentBridgeFirefoxNote',
    },
    denied: { titleKey: 'permission_deniedTitle', descriptionKey: 'permission_agentBridgeDenied' },
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
  browser: SupportedBrowser,
): boolean {
  return (featureDefinition(feature).permissions ?? []).every(
    (permission) =>
      (API_PERMISSIONS[permission] as Partial<Record<SupportedBrowser, PermissionGrant>>)[
        browser
      ] !== undefined,
  );
}

/**
 * What `feature` has to ask `browser` for, plus any `extraOrigins` (one AI provider's address),
 * and the data it collects where the browser asks for that consent too (its profile's
 * `data_collection_consent`, `lib/browser-profiles.ts`). Null when nothing: every part is granted
 * at install there.
 */
export function getPermissionRequest(
  feature: PermissionFeature,
  browser: SupportedBrowser,
  options: { extraOrigins?: readonly string[]; dataCollectionConsent: boolean },
): PermissionRequest | null {
  const extraOrigins = options.extraOrigins ?? [];
  const definition = featureDefinition(feature);
  const permissions = (definition.permissions ?? []).filter(
    (permission) =>
      (API_PERMISSIONS[permission] as Partial<Record<SupportedBrowser, PermissionGrant>>)[
        browser
      ] === 'optional',
  );
  const origins = [...(definition.origins ?? []), ...extraOrigins];
  const dataCollection = options.dataCollectionConsent
    ? [...(definition.dataCollection ?? [])]
    : [];
  const request: PermissionRequest = {
    ...(permissions.length > 0 ? { permissions: [...permissions] } : {}),
    ...(origins.length > 0 ? { origins } : {}),
    ...(dataCollection.length > 0 ? { data_collection: dataCollection } : {}),
  };
  return Object.keys(request).length > 0 ? request : null;
}

/** The manifest's `permissions` and `optional_permissions` (API names only) for `browser`. */
export function getManifestApiPermissions(browser: SupportedBrowser): {
  permissions: ApiPermission[];
  optional: ApiPermission[];
} {
  const entries = Object.entries(API_PERMISSIONS) as [
    ApiPermission,
    Partial<Record<SupportedBrowser, PermissionGrant>>,
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
