import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type BundledMessage, formatBundledMessage, SUPPORTED_LOCALES } from '@/hooks/use-i18n';
import { compactDistributionLocales, compactLocaleMessages } from '../../build/distribution-assets';
import { appRoot } from '../config-files';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('distribution locale resources', () => {
  it('strips only translator metadata and preserves unknown fields and placeholder syntax', () => {
    const source = {
      notice: {
        message: '$name$: $2 ($$), $NAME$',
        description: 'Translator guidance',
        future_field: { preserved: true },
        placeholders: {
          name: { content: '$1', example: 'Example', future_field: 'preserved' },
        },
      },
      plain: { message: '日本語 简体中文 한국어 Português' },
    };
    const raw = JSON.stringify(source, null, 4);
    const output = compactLocaleMessages(raw);

    expect(JSON.parse(output)).toEqual({
      notice: {
        message: '$name$: $2 ($$), $NAME$',
        future_field: { preserved: true },
        placeholders: { name: { content: '$1', future_field: 'preserved' } },
      },
      plain: { message: '日本語 简体中文 한국어 Português' },
    });
    expect(source.notice.description).toBe('Translator guidance');
    expect(source.notice.placeholders.name.example).toBe('Example');
    expect(output).not.toContain('\n');
    expect(compactLocaleMessages(output)).toBe(output);
  });

  it.each(SUPPORTED_LOCALES)(
    '%s keeps every key, message, and rendered substitution',
    async (locale) => {
      const source = await readFile(
        path.join(appRoot, 'public/_locales', locale, 'messages.json'),
        'utf8',
      );
      const original = JSON.parse(source) as Record<string, BundledMessage>;
      const compact = JSON.parse(compactLocaleMessages(source)) as Record<string, BundledMessage>;
      const substitutions = Array.from({ length: 9 }, (_, index) => `value ${index + 1} $$ $NAME$`);

      expect(Object.keys(compact)).toEqual(Object.keys(original));
      for (const [key, message] of Object.entries(original)) {
        expect(compact[key].message, key).toBe(message.message);
        expect(Object.keys(compact[key].placeholders ?? {}), key).toEqual(
          Object.keys(message.placeholders ?? {}),
        );
        for (const [name, placeholder] of Object.entries(message.placeholders ?? {})) {
          expect(compact[key].placeholders?.[name].content, `${key}.${name}`).toBe(
            placeholder.content,
          );
        }
        expect(formatBundledMessage(compact[key], substitutions), key).toBe(
          formatBundledMessage(message, substitutions),
        );
      }
    },
  );

  it('changes only distribution messages, leaving source bytes and other assets untouched', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'bookmark-scout-distribution-locales-'));
    tempDirs.push(tempDir);
    const sourceDir = path.join(tempDir, 'public');
    const outDir = path.join(tempDir, 'dist');
    const relativeFile = '_locales/en/messages.json';
    const raw = JSON.stringify(
      { notice: { message: 'Hello $1', description: 'Keep in source' } },
      null,
      4,
    );
    await mkdir(path.dirname(path.join(sourceDir, relativeFile)), { recursive: true });
    await writeFile(path.join(sourceDir, relativeFile), raw);
    await writeFile(path.join(sourceDir, 'license.txt'), 'Keep this asset unchanged\n');
    await cp(sourceDir, outDir, { recursive: true });

    await compactDistributionLocales(outDir);

    expect(await readFile(path.join(sourceDir, relativeFile), 'utf8')).toBe(raw);
    expect(await readFile(path.join(outDir, relativeFile), 'utf8')).toBe(
      '{"notice":{"message":"Hello $1"}}',
    );
    expect(await readFile(path.join(outDir, 'license.txt'), 'utf8')).toBe(
      'Keep this asset unchanged\n',
    );
  });

  it('fails on invalid JSON instead of publishing an incomplete locale', () => {
    expect(() => compactLocaleMessages('{ invalid')).toThrow(SyntaxError);
  });
});
