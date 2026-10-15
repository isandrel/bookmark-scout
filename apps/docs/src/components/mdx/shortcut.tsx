import { Fragment } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { shortcutParts } from "@/lib/shortcuts";

function Keys({ keys, or }: { keys: string[]; or: string }) {
  return keys.map((entry, index) => (
    <Fragment key={entry}>
      {index > 0 ? or : null}
      <code>{entry}</code>
    </Fragment>
  ));
}

/**
 * A keyboard shortcut from `apps/extension/config/ui/shortcuts.toml`, by id
 * (`<Shortcut id="commands.quick-save" />`): its keys, and its Mac keys where they differ.
 */
export function Shortcut({
  id,
  locale = DEFAULT_LOCALE,
}: {
  id: string;
  locale?: string;
}) {
  const parts = shortcutParts(id, locale);
  return (
    <>
      <Keys keys={parts.other} or={parts.or} />
      {parts.mac ? (
        <>
          {parts.macBefore}
          <Keys keys={parts.mac} or={parts.or} />
          {parts.macAfter}
        </>
      ) : null}
    </>
  );
}
