import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findConfigDir } from "@bookmark-scout/config";
import { parse } from "smol-toml";

/**
 * The AI providers the extension ships, read at build time from the extension's own config
 * (`apps/extension/config`), so the website never keeps a second list. This is the only
 * website code that reads extension files; when the extension config moves, update the
 * locations below.
 */
export type ExtensionProvider = { id: string; name: string; group?: string };

const isTable = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

function providerFrom(id: string, value: unknown): ExtensionProvider | undefined {
    if (!isTable(value) || typeof value.name !== "string") return undefined;
    return { id, name: value.name, group: typeof value.group === "string" ? value.group : undefined };
}

/** Providers in an `[ai.providers.<id>]` (or `[providers.<id>]`) table, in file order. */
function providersInTable(toml: Record<string, unknown>): ExtensionProvider[] {
    const ai = isTable(toml.ai) ? toml.ai : toml;
    const table = isTable(ai.providers) ? ai.providers : {};
    return Object.entries(table).flatMap(([id, value]) => providerFrom(id, value) ?? []);
}

/** One file per provider (`config/ai/providers/<id>.toml`), or files holding provider tables. */
function readProviderDir(dir: string): ExtensionProvider[] {
    return readdirSync(dir)
        .filter((file) => file.endsWith(".toml"))
        .sort()
        .flatMap((file) => {
            const toml = parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
            const single = providerFrom(file.replace(/\.toml$/, ""), toml);
            return single ? [single] : providersInTable(toml);
        });
}

export function readExtensionProviders(extensionConfigDir = join(dirname(findConfigDir()), "apps", "extension", "config")) {
    const providerDir = join(extensionConfigDir, "ai", "providers");
    const settingsFile = join(extensionConfigDir, "settings.default.toml");
    const providers = existsSync(providerDir)
        ? readProviderDir(providerDir)
        : existsSync(settingsFile)
          ? providersInTable(parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>)
          : [];
    if (providers.length === 0) {
        throw new Error(`No AI providers found in ${providerDir} or ${settingsFile}; update lib/extension-providers.ts`);
    }
    return providers;
}
