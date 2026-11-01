import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('inPrivateWindow', () => {
  const original = fakeBrowser.extension.inIncognitoContext;
  afterEach(() => {
    Object.assign(fakeBrowser.extension, { inIncognitoContext: original });
  });

  it('is true only for a page in a private window', () => {
    Object.assign(fakeBrowser.extension, { inIncognitoContext: false });
    expect(inPrivateWindow()).toBe(false);
    Object.assign(fakeBrowser.extension, { inIncognitoContext: true });
    expect(inPrivateWindow()).toBe(true);
  });
});
