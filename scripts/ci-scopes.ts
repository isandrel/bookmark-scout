/**
 * Maps a pull request's changed files to the CI scopes it needs, using the rules in
 * .github/ci-scopes.toml. Prints a JSON object such as {"extension":true,"sites":false}.
 *
 *   git diff --name-only <base>...HEAD | bun scripts/ci-scopes.ts
 *   bun scripts/ci-scopes.ts --all   # every scope, for pushes to main
 */
import { Glob } from "bun";
import rules from "../.github/ci-scopes.toml";

export type ScopeRules = {
  ignore: string[];
  shared: string[];
  scopes: Record<string, string[]>;
};

const matchesAny = (patterns: string[], file: string) =>
  patterns.some((pattern) => new Glob(pattern).match(file));

export function resolveScopes(files: string[], config: ScopeRules): Record<string, boolean> {
  const names = Object.keys(config.scopes);
  const result = Object.fromEntries(names.map((name) => [name, false]));
  for (const file of files.map((line) => line.trim()).filter(Boolean)) {
    if (matchesAny(config.ignore, file)) continue;
    const matched = names.filter((name) => matchesAny(config.scopes[name], file));
    const runAll = matchesAny(config.shared, file) || matched.length === 0;
    for (const name of runAll ? names : matched) result[name] = true;
  }
  return result;
}

if (import.meta.main) {
  const config = rules as ScopeRules;
  const all = process.argv.includes("--all");
  const files = all ? [] : (await Bun.stdin.text()).split("\n");
  const scopes = all
    ? Object.fromEntries(Object.keys(config.scopes).map((name) => [name, true]))
    : resolveScopes(files, config);
  console.log(JSON.stringify(scopes));
}
