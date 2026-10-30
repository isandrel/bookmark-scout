#!/usr/bin/env bun
/**
 * Frees the disk space local development leaves behind. By default it only lists what it would
 * remove and how large each is; `--apply` removes them.
 *
 * Removed with `--apply`: outputs the repository regenerates on the next run (test results,
 * coverage reports, builds, and the Nx daemon log), in this checkout and in every agent worktree,
 * and worktree entries whose folder is gone. Never removed: `apps/extension/dist` (a developer's browser loads it),
 * sources, and anything outside the repository. The shared caches outside it are listed with
 * their size only, with the command that trims each.
 *
 * Usage: bun run clean [--apply]
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "..");
const apply = process.argv.includes("--apply");

/**
 * Regenerated outputs, by path from a checkout's root, with what makes them again. `stopFirst`
 * stops the process that holds the file open, since removing an open file frees no space.
 */
const OUTPUTS: readonly { path: string; remade: string; stopFirst?: readonly string[] }[] = [
  { path: "apps/extension/test-results", remade: "any Playwright run" },
  { path: "apps/extension/playwright-report", remade: "a run with the HTML reporter" },
  { path: "apps/extension/coverage", remade: "test:coverage and test:e2e:coverage" },
  { path: "apps/extension/dist-coverage", remade: "test:e2e:coverage" },
  { path: "apps/docs/out", remade: "docs:build" },
  { path: "apps/website/out", remade: "website:build" },
  // Nx never trims this log; it reached 6.5 GB in October 2026.
  {
    path: ".nx/workspace-data/d/daemon.log",
    remade: "the Nx daemon",
    stopFirst: ["bunx", "nx", "daemon", "--stop"],
  },
];

/** Caches outside the repository: listed only, with the command that trims each. */
const SHARED = [
  {
    path: path.join(homedir(), ".nx"),
    trim: "capped by maxCacheSize in nx.json; `bunx nx reset` empties it",
  },
  { path: path.join(homedir(), ".bun/install/cache"), trim: "`bun pm cache rm`" },
  {
    path: path.join(homedir(), "Library/Caches/ms-playwright"),
    // Playwright counts a version as installed only once it has run `playwright install`, so after
    // node_modules is reinstalled, `uninstall` removes the browsers the tests use as well.
    trim: "`bunx playwright uninstall`, then `bunx playwright install chromium firefox` in apps/extension",
  },
  {
    path: path.join(homedir(), ".cache"),
    trim: "scratch folders named bookmark-scout-*",
    prefix: "bookmark-scout-",
  },
] as const;

async function sizeOf(target: string): Promise<number> {
  const output = await $`du -sk ${target}`.nothrow().quiet().text();
  return Number(output.split("\t")[0] ?? 0) * 1024;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0).padStart(6)} MB`;

const checkouts = [
  root,
  ...(existsSync(path.join(root, ".claude/worktrees"))
    ? readdirSync(path.join(root, ".claude/worktrees")).map((name) =>
        path.join(root, ".claude/worktrees", name),
      )
    : []),
];

let total = 0;
console.log(apply ? "Removing:" : "Would remove (run with --apply):");
for (const checkout of checkouts) {
  for (const output of OUTPUTS) {
    const target = path.join(checkout, output.path);
    if (!existsSync(target)) continue;
    const bytes = await sizeOf(target);
    total += bytes;
    console.log(
      `${megabytes(bytes)}  ${path.relative(root, target) || "."}  (remade by ${output.remade})`,
    );
    if (!apply) continue;
    if (output.stopFirst) await $`${output.stopFirst}`.cwd(checkout).nothrow().quiet();
    rmSync(target, { recursive: true, force: true });
  }
}
console.log(`${megabytes(total)}  in all`);
if (apply) await $`git -C ${root} worktree prune`.quiet();

console.log("\nShared caches (not touched):");
for (const cache of SHARED) {
  if (!existsSync(cache.path)) continue;
  if ("prefix" in cache) {
    const folders = readdirSync(cache.path)
      .filter((name) => name.startsWith(cache.prefix))
      .map((name) => path.join(cache.path, name))
      .filter((folder) => statSync(folder).isDirectory());
    let bytes = 0;
    for (const folder of folders) bytes += await sizeOf(folder);
    console.log(
      `${megabytes(bytes)}  ${cache.path}/${cache.prefix}* (${folders.length} folders): ${cache.trim}`,
    );
    continue;
  }
  console.log(`${megabytes(await sizeOf(cache.path))}  ${cache.path}: ${cache.trim}`);
}
