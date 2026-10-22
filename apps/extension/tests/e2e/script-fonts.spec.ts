/**
 * Bookmark titles in other scripts: the UI font has no Cyrillic or Greek, and the next fonts in
 * the stack are CJK fonts, which draw those letters wide, as if letter-spaced. Each script must
 * reach a font made for it, in an English page and in a CJK one.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { managerUrl } from './manager-helpers';
import { seedFolder, setSettings } from './tool-helpers';

const TITLES = {
  cyrillic: 'Путеводитель по Москве',
  greek: 'Οδηγός της Αθήνας',
} as const;

/** Families fonts made for Chinese, Japanese, or Korean go by, on any platform. */
const CJK_FONT =
  /Hiragino|Apple SD Gothic|PingFang|Heiti|Yu Gothic|Meiryo|MS Gothic|Malgun|Microsoft (YaHei|JhengHei)|Noto Sans (CJK|JP|KR|SC|TC)|Source Han|WenQuanYi|Droid Sans Fallback/i;

/** The platform fonts that draw the row title equal to `title`. */
async function fontsOf(page: Page, title: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'tbody tr td *',
  });
  for (const nodeId of nodeIds) {
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
    // The innermost element that holds the title, not a row or cell around it.
    if (!outerHTML.includes(title) || outerHTML.length > title.length + 300) continue;
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    if (fonts.length > 0) return fonts.map((font) => font.familyName);
  }
  throw new Error(`no rendered text for ${title}`);
}

for (const language of ['en', 'ja'] as const) {
  test(`Cyrillic and Greek titles never take a CJK font in a ${language} page`, async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Scripts', [
      { title: TITLES.cyrillic, url: 'https://cyrillic.e2e.invalid/' },
      { title: TITLES.greek, url: 'https://greek.e2e.invalid/' },
    ]);
    await setSettings(extensionWorker, { language });
    await page.goto(managerUrl(extensionId, seeded.folderId));
    await expect(page.locator('tbody tr')).toHaveCount(2);
    for (const title of Object.values(TITLES)) {
      const fonts = await fontsOf(page, title);
      expect(
        fonts.filter((font) => CJK_FONT.test(font)),
        `${title}: ${fonts.join(', ')}`,
      ).toEqual([]);
    }
  });
}
