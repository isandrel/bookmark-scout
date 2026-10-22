/**
 * The help button at the end of a search box: the search query language's operators
 * (`SEARCH_SYNTAX_HELP`), each added to the query when chosen, and a link to the search guide.
 */
import { CircleHelp } from 'lucide-react';
import { type RefObject, useState } from 'react';

type SearchSyntaxHelpProps = {
  query: string;
  onQueryChange: (query: string) => void;
  /** The search box, which gets focus back after an entry is chosen. */
  inputRef: RefObject<HTMLInputElement | null>;
};

export function SearchSyntaxHelp({ query, onQueryChange, inputRef }: SearchSyntaxHelpProps) {
  const [open, setOpen] = useState(false);
  const label = t('searchHelp_button');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={label}
            title={label}
            data-testid="search-syntax-help"
          />
        }
      >
        <CircleHelp />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" finalFocus={inputRef}>
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{t('searchHelp_intro')}</p>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1">
          {SEARCH_SYNTAX_HELP.map((entry) => (
            <li key={entry.insert}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                onClick={() => {
                  onQueryChange(addSearchSyntax(query, entry.insert));
                  setOpen(false);
                }}
              >
                <span className="min-w-0">{t(entry.labelKey)}</span>
                <code className="shrink-0 font-mono text-xs text-muted-foreground">
                  {entry.example}
                </code>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t px-3 py-2">
          <a
            href={SEARCH_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            {t('searchHelp_guide')}
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
