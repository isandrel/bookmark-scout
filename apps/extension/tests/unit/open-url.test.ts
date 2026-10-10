import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openUrl } from '@/services/bookmarks';

describe('openUrl', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('opens a new active tab, a new background tab, or replaces the current page', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    const update = vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({} as never);
    const url = 'https://example.com/page';

    await openUrl(url, 'new_tab');
    await openUrl(url, 'background_tab');
    await openUrl(url, 'current_tab');

    expect(create.mock.calls).toEqual([[{ url, active: true }], [{ url, active: false }]]);
    expect(update.mock.calls).toEqual([[{ url }]]);
  });
});
