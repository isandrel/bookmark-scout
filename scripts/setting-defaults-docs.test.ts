import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSettingDefault, site } from "@bookmark-scout/config";

/**
 * The docs never type a number setting's default by hand: they write
 * `<SettingDefault path="..." />`, which reads the extension's settings files. This fails when a
 * settings page names a number setting (by its label in that language) followed by the default
 * typed out, in the setting's unit or in seconds for a value kept in milliseconds.
 */
const root = join(import.meta.dir, "..");
const MS_PER_SECOND = 1000;
const schema = readFileSync(join(root, "apps/extension/src/lib/settings-schema.ts"), "utf8");
const numberSettings = [...schema.matchAll(/numberField\(\s*'([^']+)',\s*'([^']+)'/g)].map(
  ([, path, stem]) => ({ path, stem }),
);
const docsDir = join(root, "apps/docs/content/docs");
const settingsPages = readdirSync(docsDir).filter((file) => /^settings(\.[\w-]+)?\.mdx$/.test(file));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The extension's message folder for a docs page's language tag (`zh-CN` is `zh_CN`). */
function messagesFor(page: string): Record<string, { message: string }> {
  const tag = /^settings\.([\w-]+)\.mdx$/.exec(page)?.[1] ?? site.locales.default;
  const folder = tag.replace("-", "_");
  return JSON.parse(readFileSync(join(root, "apps/extension/public/_locales", folder, "messages.json"), "utf8"));
}

describe("docs settings pages", () => {
  it.each(settingsPages)("%s takes number defaults from the settings files", (page) => {
    const text = readFileSync(join(docsDir, page), "utf8");
    const messages = messagesFor(page);
    const typed = numberSettings.flatMap(({ path, stem }) => {
      const label = messages[`settings_${stem}`]?.message;
      const value = readSettingDefault(path);
      if (!label || typeof value !== "number") return [];
      const match = new RegExp(`\\*\\*${escape(label)}\\*\\*(?: \\|)? ?(\\d+)(?![\\d.,])`).exec(text);
      const number = match ? Number(match[1]) : undefined;
      return number === value || number === value / MS_PER_SECOND ? [`${label} (${path})`] : [];
    });
    expect(typed).toEqual([]);
  });
});
