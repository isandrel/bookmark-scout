import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

/**
 * Shared dependency versions live once, in the root `package.json`'s `workspaces.catalog` (and
 * `workspaces.catalogs` for a package whose version differs by workspace on purpose, such as
 * TypeScript 6 and 7, `typescript-versions.test.ts`). Each workspace still declares what it uses
 * (the isolated linker needs that), as `catalog:` or `catalog:<name>`. This fails on a package two
 * workspaces declare with a version of their own, and on a catalog entry nothing uses.
 */
const root = join(import.meta.dir, "..");
const FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type PackageJson = Partial<Record<(typeof FIELDS)[number], Record<string, string>>> & {
  workspaces?: {
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  };
};

const files = ["package.json", ...new Glob("{apps,packages}/*/package.json").scanSync(root)].sort();
const packages = files.map((file) => ({
  file,
  pkg: JSON.parse(readFileSync(join(root, file), "utf8")) as PackageJson,
}));
const declared = packages
  .flatMap(({ file, pkg }) =>
    FIELDS.flatMap((field) =>
      Object.entries(pkg[field] ?? {}).map(([name, range]) => ({ file, name, range })),
    ),
  )
  .filter(({ range }) => !range.startsWith("workspace:"));
const { workspaces = {} } = packages.find(({ file }) => file === "package.json")?.pkg ?? {};

describe("dependency catalog", () => {
  it("declares every package two workspaces use through the catalog, never a version of its own", () => {
    const byName = Map.groupBy(declared, ({ name }) => name);
    const own = [...byName]
      .filter(([, uses]) => uses.length > 1)
      .flatMap(([, uses]) => uses.filter(({ range }) => !range.startsWith("catalog:")))
      .map(({ file, name, range }) => `${file}: ${name} ${range}`);
    expect(own).toEqual([]);
  });

  it("names only catalog entries that exist, and keeps no entry nothing uses", () => {
    const entries = [
      ...Object.keys(workspaces.catalog ?? {}).map((name) => `catalog: ${name}`),
      ...Object.entries(workspaces.catalogs ?? {}).flatMap(([catalog, entries]) =>
        Object.keys(entries).map((name) => `catalog:${catalog} ${name}`),
      ),
    ];
    const used = declared
      .filter(({ range }) => range.startsWith("catalog:"))
      .map(({ name, range }) => (range === "catalog:" ? `catalog: ${name}` : `${range} ${name}`));
    expect([...new Set(used)].filter((ref) => !entries.includes(ref))).toEqual([]);
    expect(entries.filter((entry) => !used.includes(entry))).toEqual([]);
  });
});
