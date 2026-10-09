// Finds **bold** runs that CommonMark will not render: a closing ** after punctuation that is
// directly followed by a letter or digit, or an opening ** before punctuation that directly
// follows a letter. Common in Chinese, Japanese, and Korean, where no space separates words.
// Fix each hit with <strong>…</strong> or by moving the punctuation outside the **.
// Usage: bun check-cjk-bold.ts <file or dir> [...more]   (scans .md and .mdx files)
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: bun check-cjk-bold.ts <file or dir> [...more]');
  process.exit(2);
}
const walk = (p: string): string[] =>
  statSync(p).isDirectory()
    ? readdirSync(p).flatMap((n) => walk(path.join(p, n)))
    : /\.mdx?$/.test(p)
      ? [p]
      : [];

const PUNCT = /[\p{P}\p{S}]/u;
const WORD = /[\p{L}\p{N}]/u;
let count = 0;
for (const file of targets.flatMap(walk)) {
  const text = (await Bun.file(file).text())
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '``');
  for (const m of text.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
    const inner = m[1];
    const before = text[m.index - 1] ?? ' ';
    const after = text[m.index + m[0].length] ?? ' ';
    const badClose = PUNCT.test(inner.at(-1) as string) && WORD.test(after);
    const badOpen = PUNCT.test(inner[0]) && WORD.test(before);
    if (badClose || badOpen) {
      count++;
      console.log(`${file}: ${m[0]}${after}`);
    }
  }
}
console.log(count ? `${count} problem(s)` : 'OK');
process.exit(count ? 1 : 0);
