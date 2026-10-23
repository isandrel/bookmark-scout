/**
 * Every AI provider's default address is defined once, as `base_url` in its file in
 * apps/extension/config/ai/providers/. The docs show one with <ProviderAddress id="..." /> (or
 * `part="host"` for its host and port), so these tests fail when a docs page, website message, or
 * Markdown template types a provider's address, its host and port, or a local server's port and
 * path (`:8000/v1`) by hand, or names a provider without a default address.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readProviderAddresses } from "@bookmark-scout/config";

const root = resolve(import.meta.dir, "..");
const addresses = readProviderAddresses(root);

function files(dir: string, extension: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path, extension);
		return name.endsWith(extension) ? [path] : [];
	});
}

/** What a hand-typed address looks like: the address, and for a local server its host or port. */
const literals = [
	...new Set(
		Object.values(addresses).flatMap((address) => {
			const url = new URL(address);
			const path = url.pathname.replace(/\/$/, "");
			const local = url.hostname === "localhost";
			return [address, ...(local ? [url.host, `:${url.port}${path}`] : [])];
		}),
	),
];

/** `file:line: text` for each address typed by hand. */
function typed(file: string): string[] {
	return readFileSync(file, "utf8")
		.split("\n")
		.flatMap((line, index) =>
			literals.filter((literal) => line.includes(literal)).map((literal) => `${relative(root, file)}:${index + 1}: ${literal}`),
		);
}

const docsPages = files(join(root, "apps/docs/content/docs"), ".mdx");

describe("provider addresses are never typed by hand", () => {
	test("the config has local servers to check", () => {
		expect(literals.some((literal) => literal.startsWith(":"))).toBe(true);
	});

	test.each([
		["docs pages", docsPages],
		["website messages", files(join(root, "apps/website/messages"), ".json")],
		["Markdown templates", files(join(root, "templates"), ".md")],
	])("%s", (_name, list) => {
		expect(list.flatMap(typed)).toEqual([]);
	});
});

describe("<ProviderAddress> names a provider with a default address", () => {
	test.each(docsPages.map((page) => [relative(root, page), page]))("%s", (_name, page) => {
		const ids = [...readFileSync(page, "utf8").matchAll(/<ProviderAddress\s+id="([^"]*)"/g)].map(([, id]) => id);
		expect(ids.filter((id) => !(id in addresses))).toEqual([]);
	});
});
