import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  registerWelcomePage,
  shouldOpenWelcomePage,
  WELCOME_GUIDE_URL,
  WELCOME_PAGE_PATH,
} from '@/services/welcome-page';
import { readConfigToml } from '../config-files';

const config = { open_on_install: true, open_on_temporary_install: false };

describe('welcome page', () => {
  it('opens after a first install only, never after an update', () => {
    expect(shouldOpenWelcomePage({ reason: 'install' }, config)).toBe(true);
    for (const reason of ['update', 'chrome_update', 'browser_update', 'shared_module_update']) {
      expect(shouldOpenWelcomePage({ reason }, config)).toBe(false);
    }
  });

  it('follows the config, and skips Firefox temporary add-ons unless allowed', () => {
    expect(
      shouldOpenWelcomePage({ reason: 'install' }, { ...config, open_on_install: false }),
    ).toBe(false);
    expect(shouldOpenWelcomePage({ reason: 'install', temporary: true }, config)).toBe(false);
    expect(
      shouldOpenWelcomePage(
        { reason: 'install', temporary: true },
        { ...config, open_on_temporary_install: true },
      ),
    ).toBe(true);
    expect(shouldOpenWelcomePage({ reason: 'install', temporary: false }, config)).toBe(true);
  });

  it('opens by default, and links the guide on the docs site from config/web.toml', () => {
    expect(readConfigToml('ui/welcome.toml')).toMatchObject({ open_on_install: true });
    expect(WELCOME_GUIDE_URL).toBe(
      `${import.meta.env.BOOKMARK_SCOUT_DOCS_URL}${readConfigToml('ui/welcome.toml').guide_path}`,
    );
    expect(WELCOME_GUIDE_URL).toMatch(/^https:\/\/[^/]+\/guides\//);
  });

  describe('listener', () => {
    beforeEach(() => {
      fakeBrowser.reset();
    });

    it('opens the page in a new tab on install and does nothing on update', async () => {
      const create = vi.spyOn(fakeBrowser.tabs, 'create');
      registerWelcomePage();

      await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '0.3.0' });
      expect(create).not.toHaveBeenCalled();

      await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
      expect(create).toHaveBeenCalledWith({
        url: fakeBrowser.runtime.getURL(WELCOME_PAGE_PATH),
        active: true,
      });
    });
  });
});
