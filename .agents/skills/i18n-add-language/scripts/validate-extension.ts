// Validates one language's extension messages.json against English: missing and unknown keys,
// placeholders, plural forms the language needs (Intl.PluralRules), duplicates, and formatting.
// Usage: bun validate-extension.ts <folder, e.g. zh_CN> [path to messages.json]
// Without a path it checks apps/extension/public/_locales/<folder>/messages.json.
import path from 'node:path';

type Entry = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string }>;
};

const ROOT = path.resolve(import.meta.dir, '../../../..');
const LOCALES = path.join(ROOT, 'apps/extension/public/_locales');
const [folder, fileArg] = process.argv.slice(2);
if (!folder) {
  console.error('Usage: bun validate-extension.ts <folder> [messages.json]');
  process.exit(2);
}
const file = fileArg ?? path.join(LOCALES, folder, 'messages.json');

const en = (await Bun.file(path.join(LOCALES, 'en/messages.json')).json()) as Record<string, Entry>;
const raw = await Bun.file(file).text();
const tr = JSON.parse(raw) as Record<string, Entry>;
const problems: string[] = [];

const rules = new Intl.PluralRules(folder.replace('_', '-'));
const needed = new Set(Array.from({ length: 1001 }, (_, n) => rules.select(n)));
const PLURAL_SUFFIX = /_(zero|one|two|few|many)$/;
const pluralBase = (key: string) => key.replace(PLURAL_SUFFIX, '');
const isPluralForm = (key: string) => PLURAL_SUFFIX.test(key) && pluralBase(key) in en;

for (const key of Object.keys(en)) {
  // A plural form this language never selects (zh has no "one") is optional.
  if (isPluralForm(key) && !needed.has(key.split('_').at(-1) as string)) continue;
  if (!(key in tr)) problems.push(`missing: ${key}`);
}
for (const key of Object.keys(tr)) {
  if (!(key in en) && !isPluralForm(key)) problems.push(`unknown key: ${key}`);
}

const tokens = (m: string) =>
  [...m.matchAll(/\$([A-Za-z0-9_@]+)\$|\$[1-9]/g)]
    .map((x) => x[0].toLowerCase())
    .sort()
    .join(' ');
for (const [key, entry] of Object.entries(tr)) {
  const source = en[key] ?? en[pluralBase(key)];
  if (!source) continue;
  if (typeof entry.message !== 'string' || !entry.message.trim()) problems.push(`empty: ${key}`);
  if (tokens(entry.message) !== tokens(source.message)) {
    problems.push(`placeholders differ: ${key} (${tokens(entry.message)} vs ${tokens(source.message)})`);
  }
  if (JSON.stringify(entry.placeholders ?? null) !== JSON.stringify(source.placeholders ?? null)) {
    problems.push(`placeholders block changed: ${key}`);
  }
}

// English keys with an "_one" form are the plural keys; this language needs each form it selects.
const pluralKeys = Object.keys(en).filter((k) => k.endsWith('_one')).map(pluralBase);
for (const form of ['zero', 'two', 'few', 'many']) {
  if (!needed.has(form)) continue;
  for (const key of pluralKeys) {
    if (!(`${key}_${form}` in tr)) problems.push(`missing plural form: ${key}_${form}`);
  }
}

const keysInFile = [...raw.matchAll(/^ {4}"([^"]+)":/gm)].map((m) => m[1]);
if (keysInFile.length !== new Set(keysInFile).size) problems.push('duplicate keys');
if (raw !== `${JSON.stringify(tr, null, 4)}\n`) {
  problems.push('format: write with JSON.stringify(obj, null, 4) plus a trailing newline');
}
const extDescription = tr.extDescription?.message ?? '';
if (extDescription.length > 132) problems.push(`extDescription is ${extDescription.length} characters (max 132)`);

const identical = Object.keys(tr).filter(
  (k) => en[k] && tr[k].message === en[k].message && /[a-z]{4,}/i.test(en[k].message),
).length;
console.log(problems.length ? problems.slice(0, 60).join('\n') : 'OK');
console.log(
  `${Object.keys(tr).length} keys; ${identical} messages identical to English (check they are intentional: names, units, code)`,
);
process.exit(problems.length ? 1 : 0);
