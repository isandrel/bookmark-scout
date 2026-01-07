/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle and dark mode switch.
 */

import { ChevronDown, ChevronUp, Moon, Sparkles, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/components/theme-provider';
import { t } from '@/hooks/use-i18n';

interface BookmarkSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  forceExpandAll: boolean;
  onToggleExpandAll: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onAIRecommend?: () => void;
  isAIEnabled?: boolean;
  isAILoading?: boolean;
}

export function BookmarkSearch({
  query,
  onQueryChange,
  forceExpandAll,
  onToggleExpandAll,
  inputRef,
  onAIRecommend,
  isAIEnabled = false,
  isAILoading = false,
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
        <Input
          ref={inputRef}
          type="text"
          placeholder={t('popup_searchPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="flex-1 h-8 text-sm search-input"
        />
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

