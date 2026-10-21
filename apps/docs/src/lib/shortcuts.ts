import {
  readShortcutConfig,
  type ShortcutNoteText,
  type ShortcutPair,
  shortcutNoteText,
  shortcutPair,
  withClickWord,
} from "@bookmark-scout/config";
import { getCopy } from "@/lib/copy";

/**
 * Keyboard shortcuts as the docs print them, from the extension's shortcuts file
 * (`apps/extension/config/ui/shortcuts.toml`), so a page never spells a key out by hand. Text
 * that names both platforms puts `[display] primary` first, each platform's keys named, and the
 * other platform in parentheses.
 */
const config = readShortcutConfig();

export type ShortcutParts = ShortcutPair & {
  /** Between two ways to press it. */
  or: string;
  /** The text around both platforms' keys: before the primary keys, between the two, and after. */
  note: ShortcutNoteText;
};

const NO_NOTE: ShortcutNoteText = { before: "", middle: "", after: "" };

/** The parts of a shortcut's text: the primary platform's keys, and the note when the other's differ. */
export function shortcutParts(id: string, locale: string): ShortcutParts {
  const copy = getCopy(locale).shortcut;
  const named = shortcutPair(config, id);
  // A mouse gesture names the click in the page's language.
  const words = (keys: string[]) =>
    keys.map((way) => withClickWord(way, copy.notes));
  const pair: ShortcutPair = {
    primary: { ...named.primary, keys: words(named.primary.keys) },
    ...(named.secondary
      ? { secondary: { ...named.secondary, keys: words(named.secondary.keys) } }
      : {}),
  };
  const note = pair.secondary
    ? shortcutNoteText(copy.notes, [
        pair.primary.platform,
        pair.secondary.platform,
      ])
    : NO_NOTE;
  return { ...pair, or: copy.or, note };
}

/**
 * A shortcut as one line of text, each way to press it passed through `key`: the primary
 * platform's keys, then, when the other platform differs, its keys, each named, such as
 * `⌥⇧S on Mac (Alt+Shift+S on Windows and Linux)`.
 */
export function shortcutLine(
  parts: ShortcutParts,
  key: (keys: string) => string = (keys) => keys,
): string {
  const list = (ways: string[]) => ways.map(key).join(parts.or);
  const primary = list(parts.primary.keys);
  if (!parts.secondary) return primary;
  const { before, middle, after } = parts.note;
  return `${before}${primary}${middle}${list(parts.secondary.keys)}${after}`;
}

/** A shortcut as Markdown, for the LLM text: `` `⌥⇧S` on Mac (`Alt+Shift+S` on Windows and Linux) ``. */
export function shortcutMarkdown(id: string, locale: string): string {
  return shortcutLine(shortcutParts(id, locale), (keys) => `\`${keys}\``);
}
