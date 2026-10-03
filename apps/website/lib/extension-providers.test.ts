/// <reference types="bun" />
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AI_PROVIDERS } from "./content/ai-providers";
import { readExtensionProviders } from "./extension-providers";

const dirs: string[] = [];
const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "bookmark-scout-providers-"));
    dirs.push(dir);
    return dir;
};
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

test("reads providers from settings.default.toml in file order", () => {
    const dir = tempDir();
    writeFileSync(
        join(dir, "settings.default.toml"),
        '[ai]\nenabled = false\n\n[ai.providers.b]\nname = "Bee"\n\n[ai.providers.a]\nname = "Ay (Local)"\ngroup = "local"\n',
    );
    expect(readExtensionProviders(dir)).toEqual([
        { id: "b", name: "Bee", group: undefined },
        { id: "a", name: "Ay (Local)", group: "local" },
    ]);
});

test("prefers one file per provider under ai/providers/", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "ai", "providers"), { recursive: true });
    writeFileSync(join(dir, "settings.default.toml"), '[ai.providers.old]\nname = "Old"\n');
    writeFileSync(join(dir, "ai", "providers", "openai.toml"), 'name = "OpenAI"\n');
    writeFileSync(join(dir, "ai", "providers", "custom.toml"), '[ai.providers.custom]\nname = "Custom"\ngroup = "custom"\n');
    expect(readExtensionProviders(dir).map((provider) => provider.id)).toEqual(["custom", "openai"]);
});

test("fails instead of listing no providers", () => {
    expect(() => readExtensionProviders(tempDir())).toThrow(/No AI providers found/);
});

test("the website lists the extension's providers, without custom endpoints or qualifiers", () => {
    expect(AI_PROVIDERS).toContain("OpenAI");
    expect(AI_PROVIDERS).toContain("Ollama");
    expect(AI_PROVIDERS.some((name) => /Custom Provider|\(/.test(name))).toBe(false);
});
