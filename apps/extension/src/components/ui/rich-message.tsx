import { Fragment, type ReactNode } from 'react';

/** Marks where a substitution goes (a private-use character: `i18n.getMessage` drops NUL). */
const SLOT = '\uE000';

/**
 * A localized message whose `$1`, `$2`, ... are elements, such as a link, instead of text. The
 * translation still decides where they go.
 */
export function RichMessage({
  messageKey,
  values,
}: {
  messageKey: MessageKey;
  values: readonly ReactNode[];
}) {
  // Text and slot numbers alternate: "Redirects to ", "0", "".
  const parts = t(
    messageKey,
    values.map((_, index) => `${SLOT}${index}${SLOT}`),
  ).split(SLOT);
  return parts.map((part, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one message never reorder.
    <Fragment key={index}>{index % 2 === 1 ? values[Number(part)] : part}</Fragment>
  ));
}
