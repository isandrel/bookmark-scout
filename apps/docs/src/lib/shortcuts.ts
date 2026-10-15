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

export type ShortcutParts = {
  /** The ways to press it on Windows, Linux, and ChromeOS. */
  other: string[];
  /** The ways to press it on a Mac, when they differ from `other`. */
  mac?: string[];
  /** Between two ways to press it. */
  or: string;
  /** The Mac note around the Mac keys: `" ("` and `" on a Mac)"`. */
  macBefore: string;
  macAfter: string;
};

/** The parts of a shortcut's text: keys elsewhere, and the Mac note when the keys differ there. */
export function shortcutParts(id: string, locale: string): ShortcutParts {
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

/**
 * A shortcut as one line of text, each way to press it passed through `key`: the keys elsewhere,
 * then the Mac note when a Mac differs, such as `Alt+Shift+S (⌥⇧S on a Mac)`.
 */
export function shortcutLine(
  parts: ShortcutParts,
  key: (keys: string) => string = (keys) => keys,
): string {
  const list = (ways: string[]) => ways.map(key).join(parts.or);
  const mac = parts.mac
    ? `${parts.macBefore}${list(parts.mac)}${parts.macAfter}`
    : "";
  return `${list(parts.other)}${mac}`;
}

/** A shortcut as Markdown, for the LLM text: `` `Alt+Shift+S` (`⌥⇧S` on a Mac) ``. */
export function shortcutMarkdown(id: string, locale: string): string {
  return shortcutLine(shortcutParts(id, locale), (keys) => `\`${keys}\``);
}
