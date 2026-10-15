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
 * (`<Shortcut id="commands.quick-save" />`): its keys as key caps, and its Mac keys where they
 * differ. The page prints both platforms; once the reader's platform is known,
 * `PlatformAttribute` marks `<html data-platform>` and the CSS in `global.css` shows that
 * platform's keys alone, with both in the tooltip.
 */
export function Shortcut({
  id,
  locale = DEFAULT_LOCALE,
}: {
  id: string;
  locale?: string;
}) {
  const parts = shortcutParts(id, locale);
  if (!parts.mac) {
    return (
      <span className="bs-shortcut">
        <Keys keys={parts.other} or={parts.or} />
      </span>
    );
  }
  return (
    <span className="bs-shortcut" title={shortcutLine(parts)}>
      <span data-platform-keys="other">
        <Keys keys={parts.other} or={parts.or} />
      </span>
      <span data-platform-note="">{parts.macBefore}</span>
      <span data-platform-keys="mac">
        <Keys keys={parts.mac} or={parts.or} />
      </span>
      <span data-platform-note="">{parts.macAfter}</span>
    </span>
  );
}
