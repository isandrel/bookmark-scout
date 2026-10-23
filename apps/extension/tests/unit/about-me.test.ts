import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ABOUT_ME_MAX_LENGTH, aboutMeValue } from '@/lib/about-me-storage';
import { syncItemBytes } from '@/lib/prompt-library-storage';
import { SYNC_QUOTA, storageAreaKey } from '@/lib/storage/registry';
import { toStoredEnvelope } from '@/lib/storage/stored-value';
import { readStoredRaw, STORAGE_ITEMS } from './storage-helpers';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('About me', () => {
  it('fits the sync item quota at its longest, in the costliest character', () => {
    // Chrome stores `<` as <, 6 bytes.
    const bytes = syncItemBytes(
      storageAreaKey(STORAGE_ITEMS.aboutMe),
      toStoredEnvelope(STORAGE_ITEMS.aboutMe, '<'.repeat(ABOUT_ME_MAX_LENGTH)),
    );
    expect(bytes).toBeLessThanOrEqual(SYNC_QUOTA.bytesPerItem);
  });

  it('stores the text and removes the item when it is cleared', async () => {
    await aboutMeValue.set('I teach biology.');
    expect(await aboutMeValue.get()).toBe('I teach biology.');
    await aboutMeValue.set('  ');
    expect(await readStoredRaw(STORAGE_ITEMS.aboutMe)).toBeUndefined();
  });
});
