/**
 * BookmarkSearch component.
 * Search input with expand/collapse toggle for bookmark filtering.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  return (
    <div className="p-4 border-b shrink-0">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="text"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full search-input"
        />
        {query && (
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
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
      </div>
    </div>
  );
}
