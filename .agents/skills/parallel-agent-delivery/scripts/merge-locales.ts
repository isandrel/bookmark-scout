#!/usr/bin/env bun
/**
 * Resolve merge conflicts in JSON message files by key instead of by line.
 *
 * Run during a conflicted `git merge` (or `git rebase`), from the repository root:
 *   bun .agents/skills/parallel-agent-delivery/scripts/merge-locales.ts [file ...]
 * With no files it takes every conflicted *.json path from `git diff --name-only --diff-filter=U`.
 *
 * For each file it reads the base (:1), ours (:2), and theirs (:3) versions from the index and
 * merges them recursively: a key changed on one side takes that side, a key changed the same way on
 * both sides is kept, and a key changed differently on both sides is reported and keeps ours.
 * Key order follows theirs (usually main), with keys only ours added appended. The result is
 * written with the file's own indentation and staged. Exits 1 if any key needed a manual decision.
 */
import { $ } from 'bun';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isObject = (v: Json | undefined): v is { [key: string]: Json } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: Json | undefined, b: Json | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const raw = async (n: 1 | 2 | 3, file: string): Promise<string | undefined> => {
  const out = await $`git show :${n}:${file}`.quiet().nothrow();
  return out.exitCode === 0 ? out.stdout.toString() : undefined;
};
const parse = (text: string | undefined): Json | undefined =>
  text === undefined ? undefined : (JSON.parse(text) as Json);
// Keep the file's own indentation (the extension locales use four spaces, the website two).
const indentOf = (text: string | undefined): string => text?.match(/\n([ \t]+)\S/)?.[1] ?? '  ';

const conflicts: string[] = [];

const merge = (
  base: Json | undefined,
  ours: Json | undefined,
  theirs: Json | undefined,
  path: string,
): Json | undefined => {
  if (same(ours, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (same(base, theirs)) return ours;
  if (isObject(ours) && isObject(theirs)) {
    const b = isObject(base) ? base : {};
    const result: { [key: string]: Json } = {};
    const keys = [...Object.keys(theirs), ...Object.keys(ours).filter((k) => !(k in theirs))];
    for (const key of keys) {
      const value = merge(b[key], ours[key], theirs[key], path ? `${path}.${key}` : key);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  conflicts.push(path);
  return ours;
};

let files = process.argv.slice(2);
if (files.length === 0) {
  const out = await $`git diff --name-only --diff-filter=U`.quiet().text();
  files = out.split('\n').filter((f) => f.endsWith('.json'));
}
if (files.length === 0) {
  console.log('No conflicted JSON files.');
  process.exit(0);
}

for (const file of files) {
  const before = conflicts.length;
  const theirs = await raw(3, file);
  const merged = merge(parse(await raw(1, file)), parse(await raw(2, file)), parse(theirs), '');
  await Bun.write(file, `${JSON.stringify(merged, null, indentOf(theirs))}\n`);
  await $`git add ${file}`.quiet();
  const added = conflicts.slice(before);
  console.log(`${file}: merged${added.length ? `, ${added.length} key(s) need review` : ''}`);
  for (const key of added) console.log(`  both sides changed: ${key} (kept ours)`);
}
process.exit(conflicts.length ? 1 : 0);
