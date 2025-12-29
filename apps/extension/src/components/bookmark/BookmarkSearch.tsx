/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle and dark mode switch.
 */

import { ChevronDown, ChevronUp, Moon, Sun } from 'lucide-react';
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
}

export function BookmarkSearch({
  query,
  onQueryChange,
  forceExpandAll,
  onToggleExpandAll,
  inputRef,
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
          placeholder={t('searchPlaceholder')}
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
            title={forceExpandAll ? t('collapseAll') : t('expandAll')}
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
          title={theme === 'dark' ? t('lightMode') : t('darkMode')}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

