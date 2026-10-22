import { createContext, useContext } from 'react';

/** Where each row the manager's search lists matched (`useSearchMatches`), by row id. */
export const SearchReasonsContext = createContext<
  ReadonlyMap<string, readonly SearchMatchReason[]> | undefined
>(undefined);

/** A muted note under a row's title saying where the search matched it, when not in the title. */
export function RowSearchReason({ id }: { id: string }) {
  const reasons = useContext(SearchReasonsContext);
  const label = reasons ? searchReasonLabel(reasons.get(id)) : undefined;
  if (!label) return null;
  return (
    <span
      data-testid="row-search-reason"
      className="min-w-0 truncate text-xs text-muted-foreground"
    >
      {label}
    </span>
  );
}
