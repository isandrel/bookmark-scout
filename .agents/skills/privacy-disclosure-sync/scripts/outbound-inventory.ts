// Lists every place in the extension source where data can leave the device or reach another
// service, grouped by kind, so the result can be compared with store/privacy-disclosures.md.
// Usage: bun outbound-inventory.ts [--base <git ref>]
// With --base, only lines added since that ref are listed (for reviewing a branch).
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '../../../..');
const SRC = path.join(ROOT, 'apps/extension/src');
const EXTRA = [path.join(ROOT, 'apps/extension/manifest.config.ts')];

const KINDS: { kind: string; pattern: RegExp }[] = [
  { kind: 'network request', pattern: /\bfetch\(|new Request\(|XMLHttpRequest|sendBeacon|new WebSocket\(|new EventSource\(/ },
  { kind: 'logging fetch (AI traffic)', pattern: /createLoggingFetch/ },
  { kind: 'hard-coded external URL', pattern: /['"`]https?:\/\/(?!localhost|127\.0\.0\.1)[^'"`\s]+/ },
  { kind: 'synced storage (leaves via browser sync)', pattern: /['"`]sync:[\w-]+|storage\.sync\b/ },
  { kind: 'permission or data-collection request', pattern: /permissions\.request\(|data_collection|dataCollection:/ },
  { kind: 'opens or reads tabs and pages', pattern: /tabs\.query\(|scripting\.executeScript|['"]activeTab['"]|\bactiveTab:|tabs\.create\(/ },
  { kind: 'credentials or cookies', pattern: /credentials:\s*['"]|cookies\./ },
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return walk(file);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex > 0 ? process.argv[baseIndex + 1] : undefined;
let added: Set<string> | undefined;
if (base) {
  // "<file>:<line>" for every added line since the merge base.
  const diff = Bun.spawnSync(['git', 'diff', '--unified=0', `${base}...HEAD`, '--', 'apps/extension'], {
    cwd: ROOT,
  }).stdout.toString();
  added = new Set();
  let current = '';
  for (const line of diff.split('\n')) {
    const file = line.match(/^\+\+\+ b\/(.+)$/)?.[1];
    if (file) current = file;
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let n = start; n < start + count; n++) added.add(`${current}:${n}`);
    }
  }
}

const found = new Map<string, string[]>(KINDS.map(({ kind }) => [kind, []]));
for (const file of [...walk(SRC), ...EXTRA]) {
  const rel = path.relative(ROOT, file);
  const lines = (await Bun.file(file).text()).split('\n');
  lines.forEach((text, i) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (added && !added.has(`${rel}:${i + 1}`)) return;
    for (const { kind, pattern } of KINDS) {
      if (pattern.test(text)) found.get(kind)?.push(`${rel}:${i + 1}  ${trimmed.slice(0, 110)}`);
    }
  });
}

for (const [kind, hits] of found) {
  console.log(`\n## ${kind} (${hits.length})`);
  for (const hit of hits) console.log(`- ${hit}`);
}
