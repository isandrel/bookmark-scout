/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle and dark mode switch.
 */

import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  History,
  LibraryBig,
  type LucideIcon,
  MessageCircle,
  Moon,
  Regex,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  WholeWord,
  X,
} from 'lucide-react';
import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const searchRowConfig = readConfig(
  'ui/popup-search',
  z.strictObject({ min_text_width_px: boundedNumber({ integer: true }) }),
);

/** The search options in the search box's options menu, in menu order. */
const SEARCH_OPTION_ITEMS: readonly {
  option: keyof SearchOptions;
  label: MessageKey;
  Icon: LucideIcon;
}[] = [
  { option: 'matchCase', label: 'search_matchCase', Icon: CaseSensitive },
  { option: 'wholeWord', label: 'search_matchWholeWord', Icon: WholeWord },
  { option: 'useRegex', label: 'search_useRegex', Icon: Regex },
];

/** Space between the typed text and the buttons inside the search box, in CSS pixels. */
const CONTROLS_GAP_PX = 4;

/** Marks the button whose width stands in for the Expand all button before a search is typed. */
const ROW_ACTION_SAMPLE_ATTRIBUTE = 'data-row-action-sample';

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
 * shortens when the popup is too narrow for all of it instead of being cut off mid-word. When
 * even the short one does not fit, the Search icon and the field's label are enough.
 */
function useSearchBoxFit(
  boxRef: RefObject<HTMLDivElement | null>,
  controlsRef: RefObject<HTMLDivElement | null>,
  inputRef: RefObject<HTMLInputElement | null> | undefined,
  placeholders: { full: string; short: string },
) {
  const [reservedRight, setReservedRight] = useState<number>();
  const [fits, setFits] = useState<'full' | 'short' | 'none'>('full');

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

  const { full, short } = placeholders;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the padding changes with reservedRight.
  useLayoutEffect(
    () =>
      observeSizes([inputRef?.current], () => {
        const input = inputRef?.current;
        if (!input?.parentElement) return;
        const style = getComputedStyle(input);
        // Firefox's clientWidth of an input already leaves out the padding; the border box does
        // not differ between browsers.
        const px = (value: string) => Number.parseFloat(value) || 0;
        const free =
          input.getBoundingClientRect().width -
          px(style.borderLeftWidth) -
          px(style.borderRightWidth) -
          px(style.paddingLeft) -
          px(style.paddingRight);
        // Measured in the page, not on a canvas: a canvas can pick other fallback fonts for
        // characters the first font lacks (CJK), so the choice changed once fonts settled.
        const probe = document.createElement('span');
        probe.style.cssText =
          'position:absolute;visibility:hidden;white-space:pre;pointer-events:none';
        probe.style.font = style.font;
        probe.style.letterSpacing = style.letterSpacing;
        input.parentElement.append(probe);
        const fitsText = (text: string) => {
          probe.textContent = text;
          return probe.getBoundingClientRect().width <= free;
        };
        setFits(fitsText(full) ? 'full' : fitsText(short) ? 'short' : 'none');
        probe.remove();
      }),
    [full, short, inputRef, reservedRight],
  );

  return { reservedRight, placeholder: { full, short, none: '' }[fits] };
}

const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * Whether the row's buttons go on a second line below the search box: when, beside them, the box
 * would leave less than `min_text_width_px` for typing. It counts the buttons a search adds
 * (Expand all beside the box, Clear inside it) even before one is typed, and leaves out the
 * keyboard hint, which hides itself in a narrow box, so nothing moves while typing.
 */
function useSearchRowStacked(
  rowRef: RefObject<HTMLDivElement | null>,
  boxRef: RefObject<HTMLDivElement | null>,
  optionsRef: RefObject<HTMLDivElement | null>,
  actionsRef: RefObject<HTMLDivElement | null>,
  inputRef: RefObject<HTMLInputElement | null> | undefined,
  hasQuery: boolean,
): boolean {
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(
    () =>
      observeSizes([rowRef.current, optionsRef.current, actionsRef.current], () => {
        const row = rowRef.current;
        const box = boxRef.current;
        const options = optionsRef.current;
        const actions = actionsRef.current;
        const input = inputRef?.current;
        if (!row || !box || !options || !actions || !input) return;
        const rowGap = px(getComputedStyle(row).columnGap);
        const sample = actions.querySelector<HTMLElement>(`[${ROW_ACTION_SAMPLE_ATTRIBUTE}]`);
        const expandAll = hasQuery
          ? 0
          : (sample?.offsetWidth ?? 0) + px(getComputedStyle(actions).columnGap);
        const optionButton = options.firstElementChild as HTMLElement | null;
        const clear = hasQuery
          ? 0
          : (optionButton?.offsetWidth ?? 0) + px(getComputedStyle(options).columnGap);
        const inputStyle = getComputedStyle(input);
        // Everything in the box but the text: the search icon's padding, the border, the
        // buttons, their gap to the text, and their inset from the box's edge.
        const optionsRight =
          box.getBoundingClientRect().right - options.getBoundingClientRect().right;
        const boxChrome =
          px(inputStyle.paddingLeft) +
          px(inputStyle.borderLeftWidth) +
          options.offsetWidth +
          clear +
          CONTROLS_GAP_PX +
          optionsRight;
        const room = row.clientWidth - rowGap - actions.offsetWidth - expandAll - boxChrome;
        setStacked(room < searchRowConfig.min_text_width_px);
      }),
    [rowRef, boxRef, optionsRef, actionsRef, inputRef, hasQuery],
  );
  return stacked;
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
  /** Opens the bookmark manager in a new tab. */
  onOpenManager?: () => void;
  isAIEnabled?: boolean;
  isAILoading?: boolean;
  searchOptions: SearchOptions;
  onSearchOptionsChange: (options: Partial<SearchOptions>) => void;
  /** Recent searches shown while the empty input is focused; empty when history is disabled. */
  searchHistory?: string[];
  /** Called when the user settles on a query (Enter or leaving the search box). */
  onCommitQuery?: (query: string) => void;
  onClearHistory?: () => void;
  /** Id of the text saying what Enter does now, such as saving into the first folder match. */
  describedBy?: string;
}

export function BookmarkSearch({
  query,
  onQueryChange,
  allExpanded,
  onToggleExpandAll,
  inputRef,
  onAIRecommend,
  onAskAI,
  onOpenManager,
  isAIEnabled = false,
  isAILoading = false,
  searchOptions,
  onSearchOptionsChange,
  searchHistory = [],
  onCommitQuery,
  onClearHistory,
  describedBy,
}: BookmarkSearchProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const rowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const stacked = useSearchRowStacked(
    rowRef,
    containerRef,
    optionsRef,
    actionsRef,
    inputRef,
    Boolean(query),
  );
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
  const regexProblem = getSearchRegexProblem(query, searchOptions);
  const isInvalidRegex = regexProblem !== undefined;
  // A query the operators cannot use as typed, such as an unknown `is:` value or a date that is
  // not one, says so instead of quietly finding nothing (the manager does the same).
  const queryProblem = useMemo(() => {
    if (usesTitleSearch(searchOptions)) return undefined;
    const [diagnostic] = parseSearchQuery(query).diagnostics;
    return diagnostic ? describeSearchDiagnostic(diagnostic) : undefined;
  }, [query, searchOptions]);
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
    // An IME's Enter confirms the word being composed; it does not settle the search.
    if (isComposingEvent(e.nativeEvent)) return;
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

  const searchOptionsOn = SEARCH_OPTION_ITEMS.some(({ option }) => searchOptions[option]);
  const optionButtonClass = (active: boolean) =>
    `rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active
        ? 'bg-accent text-primary'
        : 'text-muted-foreground hover:bg-card hover:text-foreground'
    }`;

  return (
    <div className="p-2 border-b shrink-0">
      <div
        ref={rowRef}
        data-slot="search-row"
        data-stacked={stacked || undefined}
        className={cn('flex items-center gap-1', stacked && 'flex-wrap')}
      >
        {/* A size container is a stacking context, so it is lifted for the history list. */}
        <div
          ref={containerRef}
          className={cn('@container relative z-20 min-w-0 flex-1', stacked && 'basis-full')}
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            aria-label={t('newcomer_searchLabel')}
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
            aria-describedby={describedBy}
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
            <div ref={optionsRef} className="flex items-center gap-0.5">
              {/* Most people never need these, so they wait behind one button. */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  data-testid="search-options"
                  className={optionButtonClass(searchOptionsOn)}
                  title={t('newcomer_searchOptions')}
                  aria-label={t('newcomer_searchOptions')}
                >
                  <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" finalFocus={inputRef}>
                  {SEARCH_OPTION_ITEMS.map(({ option, label, Icon }) => (
                    <DropdownMenuCheckboxItem
                      key={option}
                      checked={searchOptions[option]}
                      onCheckedChange={(checked) => onSearchOptionsChange({ [option]: checked })}
                      className="gap-2"
                    >
                      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                      {t(label)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
        </div>
        <div
          ref={actionsRef}
          data-slot="search-row-actions"
          className="ml-auto flex shrink-0 items-center gap-1"
        >
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
          {onOpenManager && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onOpenManager}
              title={t('popup_openManager')}
              aria-label={t('popup_openManager')}
            >
              <LibraryBig className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            {...{ [ROW_ACTION_SAMPLE_ATTRIBUTE]: true }}
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
      </div>
      {isInvalidRegex && (
        <p role="alert" className="mt-1 px-1 text-xs text-destructive-text">
          {t(regexProblem === 'slow' ? 'search_slowRegex' : 'search_invalidRegex')}
        </p>
      )}
      {queryProblem && (
        <p
          role="status"
          data-testid="search-query-problem"
          className="mt-1 px-1 text-xs text-warning"
        >
          {queryProblem}
        </p>
      )}
    </div>
  );
}
