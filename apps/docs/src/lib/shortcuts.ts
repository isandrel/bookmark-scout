import {
  isSameOnEveryPlatform,
  readShortcutConfig,
  type ShortcutText,
  shortcutText,
} from "@bookmark-scout/config";
import { getCopy } from "@/lib/copy";

/**
 * Keyboard shortcuts as the docs print them, from the extension's shortcuts file
 * (`apps/extension/config/ui/shortcuts.toml`), so a page never spells a key out by hand.
 */
const config = readShortcutConfig();

/** The keys of shortcut `id` (`commands.quick-save`, `manager.undo`) on each platform. */
export function docsShortcut(id: string): ShortcutText {
  return shortcutText(config, id);
}

/** The parts of a shortcut's text: keys elsewhere, and the Mac note when the keys differ there. */
export function shortcutParts(id: string, locale: string) {
  const text = docsShortcut(id);
  const copy = getCopy(locale).shortcut;
  const [macBefore, macAfter] = copy.mac.split("{keys}");
  return {
    other: text.other,
    mac: isSameOnEveryPlatform(text) ? undefined : text.mac,
    or: copy.or,
    macBefore: macBefore ?? "",
    macAfter: macAfter ?? "",
  };
}

/** A shortcut as Markdown, for the LLM text: `` `Alt+Shift+S` (`⌥⇧S` on a Mac) ``. */
export function shortcutMarkdown(id: string, locale: string): string {
  const parts = shortcutParts(id, locale);
  const keys = (list: string[]) =>
    list.map((entry) => `\`${entry}\``).join(parts.or);
  const mac = parts.mac
    ? `${parts.macBefore}${keys(parts.mac)}${parts.macAfter}`
    : "";
  return `${keys(parts.other)}${mac}`;
}
