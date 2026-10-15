import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { parseShortcutConfig, type ShortcutConfig } from "./shortcuts";
import { findConfigDir } from "./workspace";

/** Where the extension keeps its shortcuts, relative to the repository root. */
export const SHORTCUT_CONFIG_FILE = "apps/extension/config/ui/shortcuts.toml";

/**
 * Reads and validates the extension's shortcuts file, for build code outside the extension: the
 * manifest build, the docs, the website, and the README generator. The extension itself reads it
 * through its own config loader.
 */
export function readShortcutConfig(root: string = dirname(findConfigDir())): ShortcutConfig {
	const file = join(root, SHORTCUT_CONFIG_FILE);
	return parseShortcutConfig(parse(readFileSync(file, "utf8")), SHORTCUT_CONFIG_FILE);
}
