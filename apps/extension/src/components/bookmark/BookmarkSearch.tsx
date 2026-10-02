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
  Search,
  Sparkles,
  Sun,
  WholeWord,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

interface BookmarkSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Every folder of the search results is open, so the toggle offers Collapse all. */
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onAIRecommend?: () => void;
  isAIEnabled?: boolean;
  isAILoading?: boolean;
  searchOptions: SearchOptions;
  onSearchOptionsChange: (options: Partial<SearchOptions>) => void;
  /** Recent searches shown while the empty input is focused; empty when history is disabled. */
  searchHistory?: string[];
  /** Called when the user settles on a query (Enter or leaving the search box). */
  onCommitQuery?: (query: string) => void;
  onClearHistory?: () => void;
}

export function BookmarkSearch({
  query,
  onQueryChange,
  allExpanded,
  onToggleExpandAll,
  inputRef,
  onAIRecommend,
  isAIEnabled = false,
  isAILoading = false,
  searchOptions,
  onSearchOptionsChange,
  searchHistory = [],
  onCommitQuery,
  onClearHistory,
}: BookmarkSearchProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const historyListId = useId();
  const [isFocused, setIsFocused] = useState(false);
  // History opens on user interaction, not on the automatic focus when the popup opens.
  const [historyRequested, setHistoryRequested] = useState(false);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(-1);
  const showHistory = isFocused && historyRequested && !query && searchHistory.length > 0;
  const isInvalidRegex = !isSearchQueryValid(query, searchOptions);
  // Keep focus in the input so choosing a history entry or toggling an option does not blur it.
  const keepInputFocus = (e: React.MouseEvent) => e.preventDefault();

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once when the popup opens.
  useEffect(() => {
    inputRef?.current?.focus();
  }, []);

  // Follow the resolved theme so the toggle is correct while the setting is "system".
  // setTheme also persists the synced theme setting.
  const isDark = resolvedTheme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const chooseHistoryEntry = (entry: string) => {
    onQueryChange(entry);
    setActiveHistoryIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (query || searchHistory.length === 0) return;
      e.preventDefault();
      setHistoryRequested(true);
      setActiveHistoryIndex((index) =>
        showHistory ? Math.min(index + 1, searchHistory.length - 1) : 0,
      );
    } else if (e.key === 'ArrowUp' && showHistory) {
      e.preventDefault();
      setActiveHistoryIndex((index) => Math.max(index - 1, -1));
    } else if (e.key === 'Escape' && showHistory) {
      e.preventDefault();
      setHistoryRequested(false);
      setActiveHistoryIndex(-1);
    } else if (e.key === 'Enter') {
      if (showHistory && activeHistoryIndex >= 0) {
        e.preventDefault();
        chooseHistoryEntry(searchHistory[activeHistoryIndex]);
        return;
      }
      onCommitQuery?.(query);
    }
  };

  const optionButtonClass = (active: boolean) =>
    `rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active
        ? 'bg-accent text-primary'
        : 'text-muted-foreground hover:bg-card hover:text-foreground'
    }`;

  return (
    <div className="p-2 border-b shrink-0">
      <div className="flex items-center gap-1">
        <div ref={containerRef} className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="text"
            placeholder={t('popup_searchPlaceholder')}
            aria-label={t('popup_searchPlaceholder')}
            aria-keyshortcuts="/"
            title={t('shortcuts_popupHint')}
            role="combobox"
            aria-expanded={showHistory}
            aria-controls={showHistory ? historyListId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              showHistory && activeHistoryIndex >= 0
                ? `${historyListId}-${activeHistoryIndex}`
                : undefined
            }
            aria-invalid={isInvalidRegex || undefined}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setHistoryRequested(true);
              setActiveHistoryIndex(-1);
            }}
            onMouseDown={() => setHistoryRequested(true)}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
              setIsFocused(false);
              setActiveHistoryIndex(-1);
              // Moving to one of the search box's own controls does not settle the query.
              if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
              onCommitQuery?.(query);
            }}
            onKeyDown={handleKeyDown}
            className="search-input h-10 w-full border-transparent bg-muted pl-8 pr-[6.5rem] text-sm focus-visible:border-input focus-visible:bg-card focus-visible:ring-offset-0"
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
                  tabIndex={-1}
                  onMouseDown={keepInputFocus}
                  onClick={() => onClearHistory?.()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('search_clearHistory')}
                </button>
              </div>
              <div id={historyListId} role="listbox" aria-label={t('search_recentSearches')}>
                {searchHistory.map((entry, index) => (
                  <div
                    key={entry}
                    id={`${historyListId}-${index}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === activeHistoryIndex}
                    onMouseDown={keepInputFocus}
                    onClick={() => chooseHistoryEntry(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') chooseHistoryEntry(entry);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted ${
                      index === activeHistoryIndex ? 'bg-accent' : ''
                    }`}
                  >
                    <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{entry}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {!query && !isFocused && (
              // The search box takes focus on open, so the hint shows once focus moves away.
              <Kbd aria-hidden="true" className="mr-1">
                /
              </Kbd>
            )}
            <button
              type="button"
              onMouseDown={keepInputFocus}
              onClick={() => onSearchOptionsChange({ matchCase: !searchOptions.matchCase })}
              className={optionButtonClass(searchOptions.matchCase)}
              title={t('search_matchCase')}
              aria-label={t('search_matchCase')}
              aria-pressed={searchOptions.matchCase}
            >
              <CaseSensitive className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={keepInputFocus}
              onClick={() => onSearchOptionsChange({ wholeWord: !searchOptions.wholeWord })}
              className={optionButtonClass(searchOptions.wholeWord)}
              title={t('search_matchWholeWord')}
              aria-label={t('search_matchWholeWord')}
              aria-pressed={searchOptions.wholeWord}
            >
              <WholeWord className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={keepInputFocus}
              onClick={() => onSearchOptionsChange({ useRegex: !searchOptions.useRegex })}
              className={optionButtonClass(searchOptions.useRegex)}
              title={t('search_useRegex')}
              aria-label={t('search_useRegex')}
              aria-pressed={searchOptions.useRegex}
            >
              <Regex className="h-3.5 w-3.5" />
            </button>
            {query && (
              <button
                type="button"
                onMouseDown={keepInputFocus}
                onClick={() => {
                  onQueryChange('');
                  inputRef?.current?.focus();
                }}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('search_clear')}
                title={t('search_clear')}
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
            className="shrink-0"
            onClick={onToggleExpandAll}
            title={allExpanded ? t('popup_collapseAll') : t('popup_expandAll')}
            aria-label={allExpanded ? t('popup_collapseAll') : t('popup_expandAll')}
          >
            {allExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={toggleTheme}
          title={isDark ? t('action_lightMode') : t('action_darkMode')}
          aria-label={isDark ? t('action_lightMode') : t('action_darkMode')}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        {isAIEnabled && onAIRecommend && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onAIRecommend}
            disabled={isAILoading}
            title={t('ai_folderRecommendation')}
            aria-label={t('ai_folderRecommendation')}
          >
            <Sparkles className={`h-4 w-4 text-ai ${isAILoading ? 'animate-pulse' : ''}`} />
          </Button>
        )}
      </div>
      {isInvalidRegex && (
        <p role="alert" className="mt-1 px-1 text-xs text-destructive-text">
          {t('search_invalidRegex')}
        </p>
      )}
    </div>
  );
}
