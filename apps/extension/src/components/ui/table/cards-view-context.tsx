import { createContext, type ReactNode, useContext } from 'react';

/**
 * Whether the table's cells are drawn in cards (the Manager View setting's Cards) rather than in
 * rows, so a cell can fit a card: a title on two lines instead of one, and no second icon.
 */
export const CardsViewContext = createContext(false);

/** A row's title: one truncated line in the list, up to Title Lines lines in a card. */
export function RowTitle({ title }: { title: string }) {
  const cards = useContext(CardsViewContext);
  return (
    <span
      className={cards ? 'line-clamp-(--card-title-lines) min-w-0 break-words' : 'min-w-0 truncate'}
      title={title}
    >
      {title}
    </span>
  );
}

/** What only the list shows, such as the move buttons, which follow the rows' order. */
export function ListOnly({ children }: { children: ReactNode }) {
  return useContext(CardsViewContext) ? null : children;
}

/** The site icon before an address: a card already shows it beside the title. */
export function AddressIcon({ url }: { url: string }) {
  return useContext(CardsViewContext) ? null : <SiteIcon url={url} className="shrink-0" />;
}
