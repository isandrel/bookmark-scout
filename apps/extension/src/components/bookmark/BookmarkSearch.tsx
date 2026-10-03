/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle and dark mode switch.
 */

import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  History,
  MessageCircle,
  Moon,
  Regex,
  Search,
  Sparkles,
  Sun,
  WholeWord,
  X,
} from 'lucide-react';
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/** Space between the typed text and the buttons inside the search box, in CSS pixels. */
const CONTROLS_GAP_PX = 4;

/** Runs `measure` now and whenever one of `elements` changes size. */
function observeSizes(elements: readonly (Element | null | undefined)[], measure: () => void) {
  measure();
  if (typeof ResizeObserver === 'undefined') return undefined;
  const observer = new ResizeObserver(measure);
  for (const element of elements) if (element) observer.observe(element);
  return () => observer.disconnect();
}

/**
 * The search box's text stops before its buttons, however many are shown, and the placeholder
 * shortens when the popup is too narrow for all of it instead of being cut off mid-word.
 */
function useSearchBoxFit(
  boxRef: RefObject<HTMLDivElement | null>,
  controlsRef: RefObject<HTMLDivElement | null>,
  inputRef: RefObject<HTMLInputElement | null> | undefined,
  placeholders: { full: string; short: string },
) {
  const [reservedRight, setReservedRight] = useState<number>();
  const [fullFits, setFullFits] = useState(true);

  useLayoutEffect(
    () =>
      observeSizes([boxRef.current, controlsRef.current], () => {
        const box = boxRef.current;
        const controls = controlsRef.current;
        if (box && controls) {
          setReservedRight(box.clientWidth - controls.offsetLeft + CONTROLS_GAP_PX);
        }
      }),
    [boxRef, controlsRef],
  );

  const { full } = placeholders;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the padding changes with reservedRight.
  useLayoutEffect(
    () =>
      observeSizes([inputRef?.current], () => {
        const input = inputRef?.current;
        const context = document.createElement('canvas').getContext('2d');
        if (!input || !context) return;
        const style = getComputedStyle(input);
        context.font = style.font;
        // Firefox's clientWidth of an input already leaves out the padding; the border box does
        // not differ between browsers.
        const px = (value: string) => Number.parseFloat(value) || 0;
        const free =
          input.getBoundingClientRect().width -
          px(style.borderLeftWidth) -
          px(style.borderRightWidth) -
          px(style.paddingLeft) -
          px(style.paddingRight);
        setFullFits(context.measureText(full).width <= free);
      }),
    [full, inputRef, reservedRight],
  );

  return { reservedRight, placeholder: fullFits ? full : placeholders.short };
}

interface BookmarkSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Every folder of the search results is open, so the toggle offers Collapse all. */
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onAIRecommend?: () => void;
  /** Opens the Ask AI chat. */
  onAskAI?: () => void;
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
  onAskAI,
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
  const controlsRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyListId = useId();
  const { reservedRight, placeholder } = useSearchBoxFit(containerRef, controlsRef, inputRef, {
    full: t('popup_searchPlaceholder'),
    short: t('search_placeholderShort'),
  });
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

  const closeHistory = () => {
    setHistoryRequested(false);
    setActiveHistoryIndex(-1);
  };

  // A plain ArrowDown is left to the page, which moves into the tree; the history list takes the
  // arrow keys only while it is open.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showHistory) {
      const opensHistory =
        !query &&
        searchHistory.length > 0 &&
        findShortcut(e.nativeEvent, POPUP_SEARCH_HISTORY_BINDINGS, { allowWhileTyping: true });
      if (opensHistory) {
        e.preventDefault();
        setHistoryRequested(true);
        setActiveHistoryIndex(-1);
      } else if (e.key === 'Enter') {
        onCommitQuery?.(query);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveHistoryIndex((index) => Math.min(index + 1, searchHistory.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveHistoryIndex((index) => Math.max(index - 1, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeHistory();
    } else if (e.key === 'Enter') {
      if (activeHistoryIndex >= 0) {
        e.preventDefault();
        chooseHistoryEntry(searchHistory[activeHistoryIndex]);
        return;
      }
      onCommitQuery?.(query);
    }
  };

  /** Focus on the input or inside the history list keeps the list open. */
  const keepsHistoryOpen = (next: EventTarget | null) =>
    next === inputRef?.current ||
    (next instanceof Node && Boolean(historyRef.current?.contains(next)));

  const optionButtonClass = (active: boolean) =>
    `rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active
        ? 'bg-accent text-primary'
        : 'text-muted-foreground hover:bg-card hover:text-foreground'
    }`;

  return (
    <div className="p-2 border-b shrink-0">
      <div className="flex items-center gap-1">
        {/* A size container is a stacking context, so it is lifted for the history list. */}
        <div ref={containerRef} className="@container relative z-20 min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            aria-label={t('popup_searchPlaceholder')}
            aria-keyshortcuts={ariaKeyShortcuts(SHORTCUT_BINDINGS.popup.focusSearch)}
            title={popupShortcutsHint()}
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
              setActiveHistoryIndex(-1);
              if (!keepsHistoryOpen(e.relatedTarget)) setIsFocused(false);
              // Moving to one of the search box's own controls does not settle the query.
              if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
              onCommitQuery?.(query);
            }}
            onKeyDown={handleKeyDown}
            style={{ paddingRight: reservedRight }}
            className="search-input h-10 w-full border-transparent bg-muted pl-8 pr-[6.5rem] text-sm focus-visible:border-input focus-visible:bg-card focus-visible:ring-offset-0"
          />
          {showHistory && (
            <div
              ref={historyRef}
              className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border bg-popover p-1 shadow-md"
              data-testid="search-history"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('search_recentSearches')}
                </span>
                {/* Tab from the search box reaches it; the list stays open while it has focus. */}
                <button
                  type="button"
                  onMouseDown={keepInputFocus}
                  onClick={() => {
                    onClearHistory?.();
                    // The list closes with its last entry; keep the keyboard in the search box.
                    inputRef?.current?.focus();
                  }}
                  onBlur={(e) => {
                    if (!keepsHistoryOpen(e.relatedTarget)) setIsFocused(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape') return;
                    e.preventDefault();
                    closeHistory();
                    inputRef?.current?.focus();
                  }}
                  className="rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <div
            ref={controlsRef}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
          >
            {!query && !isFocused && (
              // The search box takes focus on open, so the hint shows once focus moves away. A
              // narrow box keeps its room for the placeholder.
              <Kbd aria-hidden="true" className="mr-1 @max-[15rem]:hidden">
                {shortcutKeyCaps(SHORTCUT_BINDINGS.popup.focusSearch[0]).join('+')}
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
        {isAIEnabled && onAskAI && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onAskAI}
            title={t('askAI_open')}
            aria-label={t('askAI_open')}
          >
            <MessageCircle className="h-4 w-4 text-ai" />
          </Button>
        )}
        {isAIEnabled && onAIRecommend && <AIServiceSwitcher />}
      </div>
      {isInvalidRegex && (
        <p role="alert" className="mt-1 px-1 text-xs text-destructive-text">
          {t('search_invalidRegex')}
        </p>
      )}
    </div>
  );
}
