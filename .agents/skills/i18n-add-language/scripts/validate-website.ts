// Validates one language's website message files against English: keys, array lengths, ICU
// arguments, HTML-like tags, URLs, structural values, and formatting.
// Usage: bun validate-website.ts <tag, e.g. zh-CN> [staging dir]
// Without a staging dir it checks apps/website/messages/{<tag>,privacy/<tag>,support/<tag>}.json.
// A staging dir holds messages.json, privacy.json, and support.json.
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '../../../..');
const WEB = path.join(ROOT, 'apps/website/messages');
const [tag, dir] = process.argv.slice(2);
if (!tag) {
  console.error('Usage: bun validate-website.ts <tag> [staging dir]');
  process.exit(2);
}

const files = [
  { en: 'en.json', repo: `${tag}.json`, staged: 'messages.json' },
  { en: 'privacy/en.json', repo: `privacy/${tag}.json`, staged: 'privacy.json' },
  { en: 'support/en.json', repo: `support/${tag}.json`, staged: 'support.json' },
];
const STRUCTURAL = new Set(['type', 'id', 'href', 'icon', 'slug', 'level']);
const problems: string[] = [];

const args = (s: string) =>
  [...s.matchAll(/\{\s*([A-Za-z0-9_]+)\s*(?:,[^{}]*)?/g)].map((m) => m[1]).sort().join(' ');
const tags = (s: string) =>
  [...s.matchAll(/<\/?([A-Za-z0-9]+)[^>]*>/g)]
    .map((m) => (m[0].startsWith('</') ? `/${m[1]}` : m[1]))
    .sort()
    .join(' ');
const urls = (s: string) => [...s.matchAll(/https?:\/\/[^\s"<)]+/g)].map((m) => m[0]).sort().join(' ');

function walk(en: unknown, tr: unknown, at: string, file: string): void {
  if (typeof en === 'string') {
    if (typeof tr !== 'string' || !tr.trim()) {
      problems.push(`${file} ${at}: missing or empty`);
      return;
    }
    if (args(en) !== args(tr)) problems.push(`${file} ${at}: ICU arguments differ (${args(tr)} vs ${args(en)})`);
    if (tags(en) !== tags(tr)) problems.push(`${file} ${at}: tags differ (${tags(tr)} vs ${tags(en)})`);
    if (urls(en) !== urls(tr)) problems.push(`${file} ${at}: URLs differ`);
    return;
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(tr) || tr.length !== en.length) {
      problems.push(`${file} ${at}: array length differs`);
      return;
    }
    en.forEach((v, i) => walk(v, tr[i], `${at}[${i}]`, file));
    return;
  }
  if (en && typeof en === 'object') {
    if (!tr || typeof tr !== 'object') {
      problems.push(`${file} ${at}: not an object`);
      return;
    }
    const enKeys = Object.keys(en).sort();
    const trKeys = Object.keys(tr).sort();
    if (JSON.stringify(enKeys) !== JSON.stringify(trKeys)) {
      const added = trKeys.filter((k) => !enKeys.includes(k));
      const removed = enKeys.filter((k) => !trKeys.includes(k));
      problems.push(`${file} ${at}: keys differ (+${added} -${removed})`);
    }
    for (const key of enKeys) {
      const ev = (en as Record<string, unknown>)[key];
      const tv = (tr as Record<string, unknown>)[key];
      if (STRUCTURAL.has(key) && typeof ev === 'string') {
        if (tv !== ev) problems.push(`${file} ${at}.${key}: structural value changed`);
        continue;
      }
      walk(ev, tv, `${at}.${key}`, file);
    }
    return;
  }
  if (en !== tr) problems.push(`${file} ${at}: non-string value changed`);
}

for (const f of files) {
  const target = dir ? path.join(dir, f.staged) : path.join(WEB, f.repo);
  const label = path.basename(target);
  const file = Bun.file(target);
  if (!(await file.exists())) {
    problems.push(`${label}: missing file`);
    continue;
  }
  const raw = await file.text();
  const parsed = JSON.parse(raw);
  walk(await Bun.file(path.join(WEB, f.en)).json(), parsed, '', label);
  const indent = (await Bun.file(path.join(WEB, f.en)).text()).match(/^\{\n( +)/)?.[1].length ?? 2;
  if (raw !== `${JSON.stringify(parsed, null, indent)}\n`) {
    problems.push(`${label}: format with JSON.stringify(obj, null, ${indent}) plus a trailing newline`);
  }
}
console.log(problems.length ? problems.slice(0, 80).join('\n') : 'OK');
process.exit(problems.length ? 1 : 0);
