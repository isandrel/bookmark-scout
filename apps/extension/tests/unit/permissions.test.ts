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
  assertPermission,
  hasPermission,
  PermissionRequiredError,
  requestPermission,
  watchPermissions,
} from '@/services/permissions';
import { installFakePermissions } from '../fake-permissions';

const AI_DATA = ['authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'websiteContent'];

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

  it('asks for Firefox data collection consent only in Firefox', () => {
    expect(getPermissionRequest('ai', 'chrome')).toBeNull();
    expect(getPermissionRequest('ai', 'firefox')).toEqual({ data_collection: AI_DATA });
    expect(getPermissionRequest('pageReading', 'chrome')).toEqual({ origins: [...WEB_ORIGINS] });
    expect(getPermissionRequest('pageReading', 'firefox')).toEqual({
      origins: [...WEB_ORIGINS],
      data_collection: AI_DATA,
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
  });

  it('marks a feature unsupported where the browser lacks its permission', () => {
    expect(isPermissionFeatureSupported('browserIcons', 'chrome')).toBe(true);
    expect(isPermissionFeatureSupported('browserIcons', 'firefox')).toBe(false);
    expect(isPermissionFeatureSupported('contextMenu', 'firefox')).toBe(true);
  });

  it('builds the manifests and the Firefox declaration from the same table', () => {
    expect(getManifestApiPermissions('chrome')).toEqual({
      permissions: ['bookmarks', 'storage', 'activeTab', 'sidePanel'],
      optional: ['tabs', 'favicon', 'contextMenus'],
    });
    expect(getManifestApiPermissions('firefox')).toEqual({
      permissions: ['bookmarks', 'storage', 'activeTab', 'contextMenus'],
      optional: ['tabs'],
    });
    expect(getFirefoxDataCollectionPermissions()).toEqual({
      required: ['none'],
      optional: AI_DATA,
    });
  });

  it('links each permission-gated setting to its feature', () => {
    expect(getSettingPermission('contextMenuEnabled')).toBe('contextMenu');
    expect(getSettingPermission('browserIconCache')).toBe('browserIcons');
    expect(getSettingPermission('aiEnabled')).toBe('ai');
    expect(getSettingPermission('aiReadPageContent')).toBe('pageReading');
    expect(getSettingPermission('showFavicons')).toBeUndefined();
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
