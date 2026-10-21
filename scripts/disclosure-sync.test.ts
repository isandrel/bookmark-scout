import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { site } from "@bookmark-scout/config";
import { getManifestApiPermissions } from "../apps/extension/src/lib/permission-catalog";
import { INDEXED_DATABASES, STORAGE_ITEMS } from "../apps/extension/src/lib/storage/registry";
import type { SupportedBrowser } from "../apps/extension/src/lib/supported-browsers";

/**
 * What the extension stores and the permissions it declares must each be named in the documents
 * that disclose them (the `privacy-disclosure-sync` skill), so a new storage item, database, or
 * permission cannot ship without its disclosure.
 */
const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const disclosures = read("store/privacy-disclosures.md");
const permissionsDoc = read("store/permissions.md");
const docsDir = "apps/docs/content/docs";
const docsPermissionPages = readdirSync(join(root, docsDir)).filter((file) =>
  /^permissions(\.[\w-]+)?\.mdx$/.test(file),
);

const declaredPermissions = [
  ...new Set(
    (site.browsers.supported as readonly SupportedBrowser[]).flatMap((browser) => {
      const { permissions, optional } = getManifestApiPermissions(browser);
      return [...permissions, ...optional];
    }),
  ),
];

describe("privacy disclosures name everything stored", () => {
  it.each(Object.values(STORAGE_ITEMS).map((item) => item.name))(
    "storage item %s is in store/privacy-disclosures.md",
    (name) => {
      expect(disclosures).toContain(`\`${name}`);
    },
  );

  it.each(Object.values(INDEXED_DATABASES).map((database) => database.name))(
    "IndexedDB database %s is in store/privacy-disclosures.md",
    (name) => {
      expect(disclosures).toContain(`\`${name}\``);
    },
  );
});

describe("permission documents name every declared permission", () => {
  it.each(declaredPermissions)("%s is justified in store/permissions.md", (permission) => {
    expect(permissionsDoc).toContain(`\`${permission}\``);
  });

  it.each(docsPermissionPages)("%s lists every declared permission", (page) => {
    const text = read(join(docsDir, page));
    expect(declaredPermissions.filter((permission) => !text.includes(`\`${permission}\``))).toEqual(
      [],
    );
  });
});
