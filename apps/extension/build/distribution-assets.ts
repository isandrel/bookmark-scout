/**
 * Chrome i18n descriptions and placeholder examples help translators, but are not used when a
 * message is displayed. Keep them in public/ and strip them only from WXT's distribution copy.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type LocaleMessage = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};

/** Preserve every message, placeholder name/content, and other field; compact JSON whitespace. */
export function compactLocaleMessages(source: string): string {
  const messages = JSON.parse(source) as Record<string, LocaleMessage>;
  for (const message of Object.values(messages)) {
    delete message.description;
    for (const placeholder of Object.values(message.placeholders ?? {})) {
      delete placeholder.example;
    }
  }
  return JSON.stringify(messages);
}

/** Run after WXT has copied public/ into outDir; never pass the public source directory. */
export async function compactDistributionLocales(outDir: string): Promise<void> {
  const localesDir = path.join(outDir, '_locales');
  const locales = await readdir(localesDir, { withFileTypes: true });
  await Promise.all(
    locales
      .filter((locale) => locale.isDirectory())
      .map(async (locale) => {
        const file = path.join(localesDir, locale.name, 'messages.json');
        const source = await readFile(file, 'utf8');
        await writeFile(file, compactLocaleMessages(source));
      }),
  );
}
