import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import displayRanges from '@fontsource-variable/bricolage-grotesque/unicode.json';
import { describe, expect, it } from 'vitest';
import { type BundledMessage, formatBundledMessage, SUPPORTED_LOCALES } from '@/hooks/use-i18n';
import { appRoot } from '../config-files';

const sourceRoot = path.join(appRoot, 'src');
const theme = readFileSync(path.join(sourceRoot, 'styles/theme.css'), 'utf8');
const fontFaces = [...theme.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);

function inUnicodeRange(codePoint: number, declaration: string): boolean {
  return declaration.split(',').some((range) => {
    const [start, end = start] = range
      .trim()
      .replace(/^U\+/, '')
      .split('-')
      .map((bound) => Number.parseInt(bound, 16));
    return codePoint >= start && codePoint <= end;
  });
}

describe('bundled font coverage', () => {
  it('uses the display font only for the fixed, translated Options heading', () => {
    const consumers = readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.(ts|tsx|css|scss|html)$/.test(file))
      .flatMap((file) => {
        let source = readFileSync(path.join(sourceRoot, file), 'utf8');
        if (file === path.join('styles', 'theme.css')) {
          // These define the family; another use of the token or family is a new consumer.
          source = source
            .replace(/@font-face\s*\{[^}]+\}/g, '')
            .replace(/--font-display\s*:[^;]+;/g, '');
        }
        const uses = [...source.matchAll(/\bfont-display\b|Bricolage\s+Grotesque/g)].length;
        return uses ? [{ file: file.split(path.sep).join('/'), uses }] : [];
      });
    expect(consumers).toEqual([{ file: 'components/page/OptionsPage.tsx', uses: 1 }]);
    const options = readFileSync(path.join(sourceRoot, 'components/page/OptionsPage.tsx'), 'utf8');
    expect(options).toMatch(
      /<h1\s+className="[^"]*\bfont-display\b[^"]*">\s*\{t\('settings_title'\)\}\s*<\/h1>/,
    );
  });

  it.each(SUPPORTED_LOCALES)(
    '%s needs no Latin Extended glyphs in its display heading',
    (locale) => {
      const messages = JSON.parse(
        readFileSync(path.join(appRoot, 'public/_locales', locale, 'messages.json'), 'utf8'),
      ) as Record<string, BundledMessage>;
      const heading = messages.settings_title;
      expect(typeof heading.message).toBe('string');
      // Check rendered text too, so a future named placeholder cannot hide an extended glyph.
      const text = formatBundledMessage(heading);
      const extended = [...new Set(text)].filter((character) =>
        inUnicodeRange(character.codePointAt(0) as number, displayRanges['latin-ext']),
      );
      expect(extended, `${locale} display heading requires a font-coverage review`).toEqual([]);
    },
  );

  it('retains the display Latin face and full body/monospace subsets', () => {
    const display = fontFaces.filter((face) =>
      face.includes("font-family: 'Bricolage Grotesque Variable'"),
    );
    expect(display).toHaveLength(1);
    expect(display[0]).toContain('bricolage-grotesque-latin-wght-normal.woff2');
    expect(display[0]).toContain(`unicode-range: ${displayRanges.latin};`);
    for (const [family, file] of [
      ['Instrument Sans Variable', 'instrument-sans'],
      ['JetBrains Mono Variable', 'jetbrains-mono'],
    ]) {
      const faces = fontFaces.filter((face) => face.includes(`font-family: '${family}'`));
      expect(faces).toHaveLength(2);
      expect(faces.some((face) => face.includes(`${file}-latin-ext-wght-normal.woff2`))).toBe(true);
      expect(faces.some((face) => face.includes(`${file}-latin-wght-normal.woff2`))).toBe(true);
    }
  });
});
