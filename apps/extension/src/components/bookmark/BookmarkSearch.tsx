/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle and dark mode switch.
 */

import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  History,
  Moon,
  Regex,
  Sparkles,
  Sun,
  WholeWord,
  X,
} from 'lucide-react';
import { useState } from 'react';

interface BookmarkSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  forceExpandAll: boolean;
  onToggleExpandAll: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onAIRecommend?: () => void;
  isAIEnabled?: boolean;
  isAILoading?: boolean;
  searchOptions: SearchOptions;
  onSearchOptionsChange: (options: Partial<SearchOptions>) => void;
  /** Recent searches shown while the empty input is focused; empty when history is disabled. */
  searchHistory?: string[];
  /** Called when the user settles on a query (Enter or leaving the input). */
  onCommitQuery?: (query: string) => void;
  onClearHistory?: () => void;
}

export function BookmarkSearch({
  query,
  onQueryChange,
  forceExpandAll,
  onToggleExpandAll,
  inputRef,
  onAIRecommend,
  isAILoading = false,
  searchOptions,
  onSearchOptionsChange,
  searchHistory = [],
  onCommitQuery,
  onClearHistory,
}: BookmarkSearchProps) {
  const { theme, setTheme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const showHistory = isFocused && !query && searchHistory.length > 0;
  // Keep focus in the input so choosing a history entry does not dismiss the list first.
  const keepInputFocus = (e: React.MouseEvent) => e.preventDefault();

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };

  return (
    <div className="p-3 border-b shrink-0">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            type="text"
            placeholder={t('popup_searchPlaceholder')}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              onCommitQuery?.(query);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitQuery?.(query);
            }}
            className="w-full h-8 text-sm search-input pr-[6.5rem]"
          />
          {showHistory && (
            <div
              className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border bg-popover p-1 shadow-md"
              data-testid="search-history"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('search_recentSearches')}
                </span>
                <button
                  type="button"
                  onMouseDown={keepInputFocus}
                  onClick={() => onClearHistory?.()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('search_clearHistory')}
                </button>
              </div>
              {searchHistory.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onMouseDown={keepInputFocus}
                  onClick={() => onQueryChange(entry)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                >
                  <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry}</span>
                </button>
              ))}
            </div>
          )}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onSearchOptionsChange({ matchCase: !searchOptions.matchCase })}
              className={`p-1 rounded transition-colors ${
                searchOptions.matchCase
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={t('search_matchCase')}
            >
              <CaseSensitive className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSearchOptionsChange({ wholeWord: !searchOptions.wholeWord })}
              className={`p-1 rounded transition-colors ${
                searchOptions.wholeWord
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={t('search_matchWholeWord')}
            >
              <WholeWord className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSearchOptionsChange({ useRegex: !searchOptions.useRegex })}
              className={`p-1 rounded transition-colors ${
                searchOptions.useRegex
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={t('search_useRegex')}
            >
              <Regex className="h-3.5 w-3.5" />
            </button>
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange('');
                  inputRef?.current?.focus();
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            onClick={onToggleExpandAll}
            title={forceExpandAll ? t('popup_collapseAll') : t('popup_expandAll')}
          >
            {forceExpandAll ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={toggleTheme}
          title={theme === 'dark' ? t('action_lightMode') : t('action_darkMode')}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        {onAIRecommend && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            onClick={onAIRecommend}
            disabled={isAILoading}
            title="AI folder recommendation"
          >
            <Sparkles className={`h-4 w-4 text-violet-500 ${isAILoading ? 'animate-pulse' : ''}`} />
          </Button>
        )}
      </div>
    </div>
  );
}

