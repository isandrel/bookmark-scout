import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { findConfigDir } from "./workspace";

/** Where the extension keeps one file per AI provider, named by its id. */
export const PROVIDERS_CONFIG_DIR = "apps/extension/config/ai/providers";

/** The part of a provider's address a page shows: all of it, or the host and port. */
export type ProviderAddressPart = "url" | "host";

/**
 * Every provider's default address (`base_url` in its file), by provider id, for build code outside
 * the extension, such as the docs, so a page never types an address by hand. Providers without a
 * default address (Azure, the built-in model) are left out.
 */
export function readProviderAddresses(root: string = dirname(findConfigDir())): Record<string, string> {
	const dir = join(root, PROVIDERS_CONFIG_DIR);
	return Object.fromEntries(
		readdirSync(dir)
			.filter((name) => name.endsWith(".toml"))
			.sort()
			.flatMap((name) => {
				const { base_url } = parse(readFileSync(join(dir, name), "utf8")) as { base_url?: unknown };
				return typeof base_url === "string" ? [[name.slice(0, -".toml".length), base_url]] : [];
			}),
	);
}

/**
 * The default address of provider `id` (`<ProviderAddress id="ollama" />` in the docs), whole or
 * only its host and port (`localhost:11434`). Throws for an id without a default address.
 */
export function readProviderAddress(id: string, part: ProviderAddressPart = "url", root?: string): string {
	const address = readProviderAddresses(root)[id];
	if (!address) throw new Error(`No provider with a default address has the id "${id}" in ${PROVIDERS_CONFIG_DIR}`);
	return part === "host" ? new URL(address).host : address;
}
