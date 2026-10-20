import { Fragment } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { shortcutLine, shortcutParts } from "@/lib/shortcuts";

function Keys({ keys, or }: { keys: string[]; or: string }) {
  return keys.map((entry, index) => (
    <Fragment key={entry}>
      {index > 0 ? or : null}
      <kbd className="bs-kbd">{entry}</kbd>
    </Fragment>
  ));
}

/**
 * A keyboard shortcut from `apps/extension/config/ui/shortcuts.toml`, by id
 * (`<Shortcut id="commands.quick-save" />`): the primary platform's keys (`[display]` in that
 * file) as key caps, then, where the other platform's differ, both named, the other in
 * parentheses at the same size: "⌥⇧S on Mac (Alt+Shift+S on Windows and Linux)". The page prints
 * both platforms; once the reader's platform is known, `PlatformAttribute` marks
 * `<html data-platform>` and the CSS in `global.css` shows that platform's keys alone, without
 * the names, with both in the tooltip.
 */
export function Shortcut({
  id,
  locale = DEFAULT_LOCALE,
}: {
  id: string;
  locale?: string;
}) {
  const parts = shortcutParts(id, locale);
  if (!parts.secondary) {
    return (
      <span className="bs-shortcut">
        <Keys keys={parts.primary.keys} or={parts.or} />
      </span>
    );
  }
  const { before, middle, after } = parts.note;
  return (
    <span className="bs-shortcut" title={shortcutLine(parts)}>
      <span data-platform-note="">{before}</span>
      <span data-platform-keys={parts.primary.platform}>
        <Keys keys={parts.primary.keys} or={parts.or} />
      </span>
      <span data-platform-note="">{middle}</span>
      <span data-platform-keys={parts.secondary.platform}>
        <Keys keys={parts.secondary.keys} or={parts.or} />
      </span>
      <span data-platform-note="">{after}</span>
    </span>
  );
}
