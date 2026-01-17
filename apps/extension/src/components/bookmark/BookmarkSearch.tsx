/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle and dark mode switch.
 */

import { ChevronDown, ChevronUp, Moon, Sparkles, Sun, X, CaseSensitive, WholeWord, Regex } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/components/theme-provider';
import { t } from '@/hooks/use-i18n';
import type { SearchOptions } from '@/stores/bookmark-store';

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
}: BookmarkSearchProps) {
  const { theme, setTheme } = useTheme();

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
            className="w-full h-8 text-sm search-input pr-[6.5rem]"
          />
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

