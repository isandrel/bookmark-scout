import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  getFirefoxDataCollectionPermissions,
  getManifestApiPermissions,
  getPermissionRequest,
  isPermissionFeatureSupported,
  WEB_ORIGINS,
} from '@/lib/permission-catalog';
import { getSettingPermission } from '@/lib/settings-schema';
import {
  getSiteAccessOrigins,
  getUrlSite,
  getUrlSites,
  SITE_ACCESS_MAX_SITES,
} from '@/lib/site-access';
import {
  assertPermission,
  hasPermission,
  hasSiteAccess,
  PermissionRequiredError,
  requestPermission,
  requestSiteAccess,
  watchPermissions,
} from '@/services/permissions';
import { installFakePermissions } from '../fake-permissions';

/** Turning on AI: the API key, bookmarks, and the current page's title and URL. */
const AI_DATA = ['authenticationInfo', 'bookmarksInfo', 'browsingActivity'];
/** Every category any feature may ask for, as the Firefox manifest declares them. */
const ALL_DATA = ['authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'websiteContent'];

describe('permission catalog', () => {
  it('asks each browser only for the parts that are optional there', () => {
    expect(getPermissionRequest('contextMenu', 'chrome')).toEqual({
      permissions: ['contextMenus'],
    });
    expect(getPermissionRequest('contextMenu', 'edge')).toEqual({ permissions: ['contextMenus'] });
    // Firefox grants contextMenus at install; it cannot be optional there.
    expect(getPermissionRequest('contextMenu', 'firefox')).toBeNull();

    for (const browser of ['chrome', 'edge', 'firefox'] as const) {
      expect(getPermissionRequest('currentTab', browser)).toEqual({ permissions: ['tabs'] });
      expect(getPermissionRequest('webAccess', browser)).toEqual({ origins: [...WEB_ORIGINS] });
    }
    expect(getPermissionRequest('browserIcons', 'chrome')).toEqual({ permissions: ['favicon'] });
  });

  it('asks for Firefox data collection consent only in Firefox, per feature', () => {
    expect(getPermissionRequest('ai', 'chrome')).toBeNull();
    expect(getPermissionRequest('ai', 'firefox')).toEqual({ data_collection: AI_DATA });
    expect(getPermissionRequest('pageReading', 'chrome')).toEqual({ origins: [...WEB_ORIGINS] });
    // Page text only: the rest is asked for when AI is turned on.
    expect(getPermissionRequest('pageReading', 'firefox')).toEqual({
      origins: [...WEB_ORIGINS],
      data_collection: ['websiteContent'],
    });
    const provider = ['https://api.example.test/*'];
    expect(getPermissionRequest('aiProviderCheck', 'chrome', provider)).toEqual({
      origins: provider,
    });
    expect(getPermissionRequest('aiProviderCheck', 'firefox', provider)).toEqual({
      origins: provider,
      data_collection: ['authenticationInfo'],
    });
    expect(getPermissionRequest('aiProviderCheck', 'chrome')).toBeNull();
    // Local AI agents: native messaging everywhere, plus what agents read in Firefox (page text
    // comes with Read page content's own consent).
    expect(getPermissionRequest('agentBridge', 'chrome')).toEqual({
      permissions: ['nativeMessaging'],
    });
    expect(getPermissionRequest('agentBridge', 'firefox')).toEqual({
      permissions: ['nativeMessaging'],
      data_collection: ['bookmarksInfo', 'browsingActivity'],
    });
  });

  it('marks a feature unsupported where the browser lacks its permission', () => {
    expect(isPermissionFeatureSupported('browserIcons', 'chrome')).toBe(true);
    expect(isPermissionFeatureSupported('browserIcons', 'firefox')).toBe(false);
    expect(isPermissionFeatureSupported('contextMenu', 'firefox')).toBe(true);
  });

  it('builds the manifests and the Firefox declaration from the same table', () => {
    expect(getManifestApiPermissions('chrome')).toEqual({
      permissions: ['bookmarks', 'storage', 'activeTab', 'sidePanel', 'scripting', 'offscreen'],
      optional: ['tabs', 'favicon', 'contextMenus', 'nativeMessaging'],
    });
    expect(getManifestApiPermissions('firefox')).toEqual({
      permissions: ['bookmarks', 'storage', 'activeTab', 'scripting', 'contextMenus'],
      optional: ['tabs', 'nativeMessaging'],
    });
    expect(getFirefoxDataCollectionPermissions()).toEqual({
      required: ['none'],
      optional: ALL_DATA,
    });
  });

  it('links each permission-gated setting to its feature', () => {
    expect(getSettingPermission('contextMenuEnabled')).toBe('contextMenu');
    expect(getSettingPermission('browserIconCache')).toBe('browserIcons');
    expect(getSettingPermission('aiEnabled')).toBe('ai');
    expect(getSettingPermission('aiReadPageContent')).toBe('pageReading');
    expect(getSettingPermission('agentBridgeEnabled')).toBe('agentBridge');
    expect(getSettingPermission('showFavicons')).toBeUndefined();
  });
});

describe('website access for a run', () => {
  it('groups web URLs by site, with subdomains and both schemes', () => {
    expect(
      getUrlSites([
        'https://www.example.com/a',
        'http://example.com/b',
        'https://docs.example.com/c',
        'https://news.bbc.co.uk/',
        'http://192.168.1.10:8080/router',
        'http://localhost:3000/',
        'javascript:void(0)',
        'file:///tmp/x.html',
        'not a url',
      ]),
    ).toEqual(['example.com', 'bbc.co.uk', '192.168.1.10', 'localhost']);
    expect(getUrlSite('chrome://settings')).toBeNull();
  });

  it('asks for each site with its subdomains, and for all websites above the limit', () => {
    expect(getSiteAccessOrigins(['example.com', '192.168.1.10', 'localhost'])).toEqual([
      'http://*.example.com/*',
      'https://*.example.com/*',
      'http://192.168.1.10/*',
      'https://192.168.1.10/*',
      'http://localhost/*',
      'https://localhost/*',
    ]);
    expect(getSiteAccessOrigins([])).toEqual([]);
    const sites = Array.from({ length: SITE_ACCESS_MAX_SITES }, (_, index) => `s${index}.com`);
    expect(getSiteAccessOrigins(sites)).toHaveLength(SITE_ACCESS_MAX_SITES * 2);
    expect(getSiteAccessOrigins([...sites, 'one-more.com'])).toBeNull();
  });

  it("requests only the run's sites, and needs nothing for a run without web links", async () => {
    fakeBrowser.reset();
    installFakePermissions();
    const origins = getSiteAccessOrigins(['example.com']) ?? [];
    await expect(hasSiteAccess('webAccess', origins)).resolves.toBe(false);
    await expect(requestSiteAccess('webAccess', origins)).resolves.toBe(true);
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ origins });
    await expect(hasSiteAccess('webAccess', origins)).resolves.toBe(true);
    // All websites are still not granted.
    await expect(hasPermission('webAccess')).resolves.toBe(false);

    vi.mocked(fakeBrowser.permissions.request).mockClear();
    await expect(hasSiteAccess('webAccess', [])).resolves.toBe(true);
    await expect(requestSiteAccess('webAccess', [])).resolves.toBe(true);
    expect(fakeBrowser.permissions.request).not.toHaveBeenCalled();
  });
});

describe('permission requests', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    setLanguage('en');
  });
  afterEach(() => {
    setLanguage('auto');
  });

  it('grants a feature when the user allows it', async () => {
    const permissions = installFakePermissions();
    await expect(hasPermission('contextMenu')).resolves.toBe(false);

    await expect(requestPermission('contextMenu')).resolves.toBe(true);
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ permissions: ['contextMenus'] });
    await expect(hasPermission('contextMenu')).resolves.toBe(true);
    expect(permissions.control.answer).toBe(true);
  });

  it('leaves the feature off when the user declines', async () => {
    const permissions = installFakePermissions();
    permissions.control.answer = false;

    await expect(requestPermission('currentTab')).resolves.toBe(false);
    await expect(hasPermission('currentTab')).resolves.toBe(false);
    await expect(assertPermission('currentTab')).rejects.toBeInstanceOf(PermissionRequiredError);
  });

  it('treats a rejected or throwing request, or a failing check, as not granted', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => {
      throw new Error('This function must be called during a user gesture');
    });
    await expect(requestPermission('webAccess')).resolves.toBe(false);
    fakeBrowser.permissions.request = vi.fn(() => {
      throw new Error('unsupported');
    });
    await expect(requestPermission('webAccess')).resolves.toBe(false);
    fakeBrowser.permissions.contains = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(hasPermission('webAccess')).resolves.toBe(false);
  });

  it('needs no request for a feature with nothing optional in this browser', async () => {
    const request = vi.fn(async () => false);
    fakeBrowser.permissions.request = request;
    // Chrome has no data collection consent, so AI needs nothing at runtime.
    await expect(requestPermission('ai')).resolves.toBe(true);
    await expect(hasPermission('ai')).resolves.toBe(true);
    await expect(assertPermission('ai')).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('reports a revoke to watchers, and the feature is off afterwards', async () => {
    const permissions = installFakePermissions({ permissions: ['contextMenus'] });
    const listener = vi.fn();
    const stop = watchPermissions(listener);
    await expect(hasPermission('contextMenu')).resolves.toBe(true);

    permissions.revoke({ permissions: ['contextMenus'] });
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(hasPermission('contextMenu')).resolves.toBe(false);

    permissions.grant({ permissions: ['contextMenus'] });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    expect(permissions.listenerCount()).toBe(0);
  });

  it('explains a missing permission in the error message', () => {
    const error = new PermissionRequiredError('currentTab');
    expect(error.feature).toBe('currentTab');
    expect(error.message).toBe(
      'Nothing was saved. Open the toolbar popup on the page instead, or allow tab access when asked.',
    );
  });
});
