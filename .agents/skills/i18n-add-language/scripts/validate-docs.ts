// Validates one language's docs pages against English: every page and sidebar file exists,
// frontmatter keys, code, MDX components and props, links, inline code, and heading ids.
// Usage: bun validate-docs.ts <tag, e.g. zh-CN> [staging dir]
// Without a staging dir it checks apps/docs/content/docs. A staging dir mirrors that folder.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';

const ROOT = path.resolve(import.meta.dir, '../../../..');
const SRC = path.join(ROOT, 'apps/docs/content/docs');
const [tag, dirArg] = process.argv.slice(2);
if (!tag) {
  console.error('Usage: bun validate-docs.ts <tag> [staging dir]');
  process.exit(2);
}
const dir = dirArg ?? SRC;
const problems: string[] = [];

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const f = path.join(d, n);
    return statSync(f).isDirectory() ? walk(f) : [path.relative(SRC, f)];
  });
// English sources have no language segment: faq.mdx, meta.json.
const english = walk(SRC).filter((f) => /^[^.]+\.(mdx|json)$/.test(path.basename(f)));

const FENCE = /```[\s\S]*?```/g;
const strip = (s: string) => s.replace(/^---\n[\s\S]*?\n---\n/, '');
const frontKeys = (s: string) =>
  (s.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '')
    .split('\n')
    .map((l) => l.split(':')[0])
    .filter(Boolean)
    .sort()
    .join(',');
const fences = (s: string) => [...s.matchAll(FENCE)].map((m) => m[0]).join('\n---\n');
const noFences = (s: string) => s.replace(FENCE, '');
// A Callout title is human text, so its value may differ; every other prop must match.
const normalizeProps = (props: string) => props.replace(/\btitle="[^"]*"/g, 'title=*');
// Props that follow the page language's grammar, so a translation may add, drop, or change them:
// how <Languages /> joins its list ("or") and whether it capitalizes the names (German nouns).
const GRAMMAR_PROPS: Record<string, readonly string[]> = { Languages: ['join', 'capitalize'] };
const dropGrammarProps = (name: string, props: string) =>
  (GRAMMAR_PROPS[name] ?? []).reduce(
    (rest, prop) => rest.replace(new RegExp(`\\s*\\b${prop}(?:=(?:"[^"]*"|\\{[^}]*\\}))?`, 'g'), ''),
    props,
  );
const jsx = (s: string) =>
  [...noFences(s).matchAll(/<\/?([A-Z][A-Za-z0-9.]*)((?:\s+[^<>]*?)?)\s*\/?>/g)]
    .map((m) => `${m[1]}${normalizeProps(dropGrammarProps(m[1], m[2]).replace(/\s+/g, ' ').trim())}`)
    .sort()
    .join('\n');
const links = (s: string) =>
  [...noFences(s).matchAll(/\]\(([^)\s]+)\)|\b(?:href|to|path)=["{]([^"}]+)["}]/g)]
    .map((m) => m[1] ?? m[2])
    .sort()
    .join('\n');
const inlineCode = (s: string) => [...noFences(s).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

// Inline code a translation may localize; every other `code` span stays as in English.
// - Search examples: the words become the page language's (`folder:Arbeit`, `レシピ スープ`), but
//   operators (`folder:`), minus signs, quotes, and slashes stay, so the shape must match.
// - Key names: the language's own keyboard labels (German `Umschalt`, `Pos1`), or plain text.
// A new localized example or key name in an English page goes in this list.
const LOCALIZABLE_CODE = {
  examples: [
    'recipe soup',
    '"tomato soup"',
    'recipe -cake',
    '-tag:archive',
    'folder:Work',
    'path:Work',
    'folder:"Work / Docs"',
    'tag:reading',
    'summary:recipe',
    'content:recipe',
    'folder:Reading -tag:read',
  ],
  keys: ['Shift', 'Home', 'End', 'Space'],
} as const;
const EXAMPLES = new Set<string>(LOCALIZABLE_CODE.examples);
const KEYS = new Set<string>(LOCALIZABLE_CODE.keys);
// Words become `·`; operator names before a colon and the punctuation between words stay. A
// quoted phrase may have another number of words ("sopa de tomate").
const shape = (code: string) =>
  code
    .replace(/\b([a-z]+:)|[\p{L}\p{N}][\p{L}\p{N}\p{M}._'-]*/gu, (_word, op) => op ?? '·')
    .replace(/"[· ]+"/g, '"·"');

/** The English spans the translation lacks and the spans it adds, after the allowed changes. */
function codeDiff(en: string[], tr: string[]): { missing: string[]; extra: string[] } {
  const extra = [...tr];
  const take = (match: (code: string) => boolean) => {
    const i = extra.findIndex(match);
    if (i >= 0) extra.splice(i, 1);
    return i >= 0;
  };
  const unmatched = en.filter((code) => !take((t) => t === code));
  const missing = unmatched.filter((code) => {
    if (EXAMPLES.has(code)) return !take((t) => shape(t) === shape(code));
    // A key name may be another single label, or plain text.
    if (KEYS.has(code)) {
      take((t) => shape(t) === '·');
      return false;
    }
    return true;
  });
  return { missing, extra };
}
const headings = (s: string) =>
  [...noFences(strip(s)).matchAll(/^(#{2,6})\s+(.+)$/gm)].map((m) => ({ level: m[1], text: m[2] }));

for (const rel of english) {
  const target = path.join(dir, rel.replace(/\.(mdx|json)$/, `.${tag}.$1`));
  const file = Bun.file(target);
  if (!(await file.exists())) {
    problems.push(`missing: ${path.relative(dir, target)}`);
    continue;
  }
  const en = await Bun.file(path.join(SRC, rel)).text();
  const tr = await file.text();

  if (rel.endsWith('.json')) {
    const e = JSON.parse(en);
    const t = JSON.parse(tr);
    if (JSON.stringify(Object.keys(e).sort()) !== JSON.stringify(Object.keys(t).sort())) {
      problems.push(`${rel}: meta keys differ`);
    }
    const pages = (p: string[]) => p.filter((x) => !/^---.*---$/.test(x));
    if (JSON.stringify(pages(e.pages ?? [])) !== JSON.stringify(pages(t.pages ?? []))) {
      problems.push(`${rel}: pages list differs (keep the order; translate only ---Section--- names)`);
    }
    continue;
  }

  if (frontKeys(en) !== frontKeys(tr)) problems.push(`${rel}: frontmatter keys differ`);
  if (fences(en) !== fences(tr)) problems.push(`${rel}: fenced code blocks must be identical`);
  if (jsx(en) !== jsx(tr)) problems.push(`${rel}: MDX components or their props differ`);
  if (links(en) !== links(tr)) problems.push(`${rel}: link targets differ`);
  const code = codeDiff(inlineCode(en), inlineCode(tr));
  if (code.missing.length || code.extra.length) {
    problems.push(
      `${rel}: inline code differs (keep \`code\` spans unchanged; see LOCALIZABLE_CODE): ` +
        [...code.missing.map((c) => `-${c}`), ...code.extra.map((c) => `+${c}`)].join(', '),
    );
  }

  // Other pages link to headings by their English id, so each translated heading keeps it.
  const eh = headings(en);
  const th = headings(tr);
  if (eh.length !== th.length) {
    problems.push(`${rel}: ${th.length} headings vs ${eh.length}`);
    continue;
  }
  const slugger = new GithubSlugger();
  eh.forEach((h, i) => {
    const explicit = h.text.match(/\[#([^\]]+)\]\s*$/)?.[1];
    const id = explicit ?? slugger.slug(h.text.replace(/`/g, ''));
    if (explicit) slugger.slug(explicit);
    if (th[i].level !== h.level) problems.push(`${rel}: heading ${i + 1} level differs`);
    if (!th[i].text.trimEnd().endsWith(`[#${id}]`)) {
      problems.push(`${rel}: heading ${i + 1} must end with [#${id}] (got: ${th[i].text.slice(0, 50)})`);
    }
  });
}
console.log(problems.length ? problems.slice(0, 80).join('\n') : 'OK');
process.exit(problems.length ? 1 : 0);
