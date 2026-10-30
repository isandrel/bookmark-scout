import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { findConfigDir } from "./workspace";

/** Where the extension keeps its address bar keyword, relative to the repository root. */
export const OMNIBOX_CONFIG_FILE = "apps/extension/config/ui/omnibox.toml";

/** What the browsers accept as a keyword and a user can type without a modifier key. */
const KEYWORD = /^[a-z0-9]{1,16}$/;

/** The address bar keyword (`manifest.omnibox.keyword`), as config/ui/omnibox.toml sets it. */
export function parseOmniboxKeyword(raw: unknown, file = OMNIBOX_CONFIG_FILE): string {
  const keyword =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).keyword : undefined;
  if (typeof keyword !== "string" || !KEYWORD.test(keyword)) {
    throw new Error(`${file}: keyword must be 1 to 16 lowercase letters or digits`);
  }
  return keyword;
}

/**
 * Reads the extension's address bar keyword, for build code outside the extension: the manifest
 * build and the docs. The extension itself reads the file through its own config loader.
 */
export function readOmniboxKeyword(root: string = dirname(findConfigDir())): string {
  return parseOmniboxKeyword(parse(readFileSync(join(root, OMNIBOX_CONFIG_FILE), "utf8")));
}
