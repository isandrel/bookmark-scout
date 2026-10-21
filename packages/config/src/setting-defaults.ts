import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { findConfigDir } from "./workspace";

/** Where the extension keeps its settings' defaults, one file per Settings category. */
export const SETTINGS_CONFIG_DIR = "apps/extension/config/settings";

/** A setting's default as its file writes it: a value, or `{ default = ... }` with its bounds. */
export type SettingDefault = string | number | boolean | readonly unknown[];

/**
 * The default of the setting at `path` (`<file>.<section>.<key>`, as `settings-schema.ts` names
 * it: `behavior.links.confirm_open_above`), for build code outside the extension, such as the
 * docs, so a page never types a default by hand. Throws for a path no file defines.
 */
export function readSettingDefault(path: string, root: string = dirname(findConfigDir())): SettingDefault {
	const [file, ...keys] = path.split(".");
	if (!file || keys.length === 0) throw new Error(`A setting path is <file>.<section>.<key>, got "${path}"`);
	const raw = parse(readFileSync(join(root, SETTINGS_CONFIG_DIR, `${file}.toml`), "utf8")) as Record<string, unknown>;
	let node: unknown = raw;
	for (const key of keys) {
		node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[key] : undefined;
	}
	const value =
		typeof node === "object" && node !== null && !Array.isArray(node) && "default" in node
			? (node as { default: unknown }).default
			: node;
	if (value === undefined || (typeof value === "object" && !Array.isArray(value))) {
		throw new Error(`No setting default at "${path}" in ${SETTINGS_CONFIG_DIR}/${file}.toml`);
	}
	return value as SettingDefault;
}
