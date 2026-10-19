import {
  readShortcutConfig,
  type ShortcutPair,
  shortcutPair,
  splitShortcutNote,
} from "@bookmark-scout/config";
import { getCopy } from "@/lib/copy";

/**
 * Keyboard shortcuts as the docs print them, from the extension's shortcuts file
 * (`apps/extension/config/ui/shortcuts.toml`), so a page never spells a key out by hand. Text
 * that names both platforms puts `[display] primary` first and the other platform in a note.
 */
const config = readShortcutConfig();

export type ShortcutParts = ShortcutPair & {
  /** Between two ways to press it. */
  or: string;
  /** The note around the secondary keys: the space before it, and the text before and after them. */
  note: { space: string; before: string; after: string };
};

const NO_NOTE = { space: "", before: "", after: "" };

/** The parts of a shortcut's text: the primary platform's keys, and the note when the other's differ. */
export function shortcutParts(id: string, locale: string): ShortcutParts {
  const pair = shortcutPair(config, id);
  const copy = getCopy(locale).shortcut;
  const note = pair.secondary
    ? splitShortcutNote(copy.notes[pair.secondary.platform])
    : NO_NOTE;
  return { ...pair, or: copy.or, note };
}

/**
 * A shortcut as one line of text, each way to press it passed through `key`: the primary
 * platform's keys, then the note when the other platform differs, such as
 * `⌥⇧S (Alt+Shift+S on Windows and Linux)`.
 */
export function shortcutLine(
  parts: ShortcutParts,
  key: (keys: string) => string = (keys) => keys,
): string {
  const list = (ways: string[]) => ways.map(key).join(parts.or);
  const primary = list(parts.primary.keys);
  if (!parts.secondary) return primary;
  const { space, before, after } = parts.note;
  return `${primary}${space}${before}${list(parts.secondary.keys)}${after}`;
}

/** A shortcut as Markdown, for the LLM text: `` `⌥⇧S` (`Alt+Shift+S` on Windows and Linux) ``. */
export function shortcutMarkdown(id: string, locale: string): string {
  return shortcutLine(shortcutParts(id, locale), (keys) => `\`${keys}\``);
}
