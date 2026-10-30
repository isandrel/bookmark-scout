import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { browserProfile } from '@/lib/browser-profiles';
import {
  getFirefoxDataCollectionPermissions,
  getManifestApiPermissions,
  getPermissionRequest,
  isPermissionFeatureSupported,
  WEB_ORIGINS,
} from '@/lib/permission-catalog';
import { getSettingPermission } from '@/lib/settings-schema';
import {
  countUrlSites,
  getSiteAccessOrigins,
  getUrlSite,
  getUrlSites,
  isUrlOnSites,
  SITE_ACCESS_MAX_SITES,
  toSiteName,
  toTypedSiteName,
  urlSiteSchema,
} from '@/lib/site-access';
import type { SupportedBrowser } from '@/lib/supported-browsers';
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

/** What `feature` asks `browser` for, with that browser's data collection consent. */
const request = (feature: PermissionFeature, browser: SupportedBrowser, extraOrigins?: string[]) =>
  getPermissionRequest(feature, browser, {
    extraOrigins,
    dataCollectionConsent: browserProfile(browser).dataCollectionConsent,
  });

describe('permission catalog', () => {
  it('asks each browser only for the parts that are optional there', () => {
    expect(request('contextMenu', 'chrome')).toEqual({
      permissions: ['contextMenus'],
    });
    expect(request('contextMenu', 'edge')).toEqual({ permissions: ['contextMenus'] });
    // Firefox grants contextMenus at install; it cannot be optional there.
    expect(request('contextMenu', 'firefox')).toBeNull();

    for (const browser of ['chrome', 'edge', 'firefox'] as const) {
      expect(request('currentTab', browser)).toEqual({ permissions: ['tabs'] });
      expect(request('webAccess', browser)).toEqual({ origins: [...WEB_ORIGINS] });
      // The literal pattern captureVisibleTab needs without a click; nothing leaves the device,
      // so Firefox asks for no data collection.
      expect(request('browseCovers', browser)).toEqual({ origins: ['<all_urls>'] });
    }
    expect(request('browserIcons', 'chrome')).toEqual({ permissions: ['favicon'] });
  });

  it('asks for Firefox data collection consent only in Firefox, per feature', () => {
    expect(request('ai', 'chrome')).toBeNull();
    expect(request('ai', 'firefox')).toEqual({ data_collection: AI_DATA });
    expect(request('pageReading', 'chrome')).toEqual({ origins: [...WEB_ORIGINS] });
    // Page text only: the rest is asked for when AI is turned on.
    expect(request('pageReading', 'firefox')).toEqual({
      origins: [...WEB_ORIGINS],
      data_collection: ['websiteContent'],
    });
    const provider = ['https://api.example.test/*'];
    expect(request('aiProviderCheck', 'chrome', provider)).toEqual({
      origins: provider,
    });
    expect(request('aiProviderCheck', 'firefox', provider)).toEqual({
      origins: provider,
      data_collection: ['authenticationInfo'],
    });
    expect(request('aiProviderCheck', 'chrome')).toBeNull();
    // Local AI agents: native messaging everywhere, plus what agents read in Firefox (page text
    // comes with Read page content's own consent).
    expect(request('agentBridge', 'chrome')).toEqual({
      permissions: ['nativeMessaging'],
    });
    expect(request('agentBridge', 'firefox')).toEqual({
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
      permissions: [
        'bookmarks',
        'storage',
        'activeTab',
        'sidePanel',
        'scripting',
        'offscreen',
        'alarms',
      ],
      optional: ['tabs', 'favicon', 'contextMenus', 'nativeMessaging'],
    });
    expect(getManifestApiPermissions('firefox')).toEqual({
      permissions: ['bookmarks', 'storage', 'activeTab', 'scripting', 'alarms', 'contextMenus'],
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

  it('counts the URLs of each site, most first, for a run whose sites the user chooses (S03)', () => {
    expect(
      countUrlSites([
        'https://b.example.org/1',
        'https://www.example.com/a',
        'http://docs.example.com/b',
        'https://a.example.net/',
        'javascript:void(0)',
      ]),
    ).toEqual([
      { site: 'example.com', count: 2 },
      { site: 'example.net', count: 1 },
      { site: 'example.org', count: 1 },
    ]);
    // A chosen site is a site as getUrlSite names it, never an address or a pattern.
    for (const site of ['example.com', 'bbc.co.uk', '192.168.1.10', 'localhost', '[::1]']) {
      expect(urlSiteSchema.safeParse(site).success).toBe(true);
    }
    for (const site of ['www.example.com', 'Example.com', '*.example.com', 'example.com/a', '']) {
      expect(urlSiteSchema.safeParse(site).success).toBe(false);
    }
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

describe('lists of sites the user types (Never Read These Sites)', () => {
  it('keeps the host of a typed site or a pasted address, lowercase, without www.', () => {
    expect(toSiteName('Example.COM')).toBe('example.com');
    expect(toSiteName(' www.example.com. ')).toBe('example.com');
    expect(toSiteName('https://news.example.com/story?id=1#top')).toBe('news.example.com');
    expect(toSiteName('bücher.example')).toBe('xn--bcher-kva.example');
    expect(toSiteName('localhost')).toBe('localhost');
    for (const raw of ['', '  ', 'not a site', 'file:///etc/passwd', 'https://', '[::1]']) {
      expect(toSiteName(raw), raw).toBeUndefined();
    }
  });

  it('turns down a single word typed into a list, keeping localhost and dotted names', () => {
    expect(toTypedSiteName('aa')).toBeUndefined();
    expect(toTypedSiteName('com')).toBeUndefined();
    expect(toTypedSiteName('localhost')).toBe('localhost');
    expect(toTypedSiteName('https://www.Example.com/a')).toBe('example.com');
    expect(toTypedSiteName('192.168.1.10')).toBe('192.168.1.10');
    // A stored entry an earlier release accepted still reads back.
    expect(toSiteName('aa')).toBe('aa');
  });

  it('matches a site and its subdomains, and nothing else', () => {
    const sites = ['example.com'];
    expect(isUrlOnSites('https://example.com/a', sites)).toBe(true);
    expect(isUrlOnSites('http://www.example.com/a', sites)).toBe(true);
    expect(isUrlOnSites('https://news.example.com/a', sites)).toBe(true);
    expect(isUrlOnSites('https://notexample.com/a', sites)).toBe(false);
    expect(isUrlOnSites('https://example.com.evil.test/a', sites)).toBe(false);
    expect(isUrlOnSites('javascript:void(0)', sites)).toBe(false);
    expect(isUrlOnSites('https://example.com/a', [])).toBe(false);
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
