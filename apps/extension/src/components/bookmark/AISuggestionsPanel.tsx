import { Folder, FolderPlus, Sparkles, X } from 'lucide-react';
import { z } from 'zod';

const suggestionsConfig = readConfig(
  'ui/popup-suggestions',
  z.strictObject({ max_height_fraction: z.number().gt(0).max(1) }),
);

type AISuggestionsPanelProps = {
  recommendations: readonly FolderRecommendation[];
  /** Title of the page the suggestions are for. */
  pageTitle: string;
  /** Title of the bookmarks bar, left out of the paths because most folders live there. */
  barTitle: string | undefined;
  truncateLength: number;
  onSelect: (recommendation: FolderRecommendation) => void;
  onClose: () => void;
};

/**
 * AI folder suggestions for the current page, above the popup's bookmark tree. Its height is
 * capped and the suggestions scroll inside it, so the tree and key hints stay on screen.
 */
export function AISuggestionsPanel({
  recommendations,
  pageTitle,
  barTitle,
  truncateLength,
  onSelect,
  onClose,
}: AISuggestionsPanelProps) {
  return (
    <div
      data-testid="ai-suggestions"
      className="flex shrink-0 flex-col border-b py-2"
      style={{ maxHeight: `${suggestionsConfig.max_height_fraction * 100}%` }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-ai" />
          <span className="truncate">
            {t('ai_suggestionsFor')} {truncateText(pageTitle, truncateLength)}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t('action_close')}
          title={t('action_close')}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="mt-1 min-h-0 space-y-1 overflow-y-auto px-2" data-slot="ai-suggestion-list">
        {recommendations.map((rec) => (
          <button
            key={rec.folderPath}
            type="button"
            onClick={() => onSelect(rec)}
            title={rec.reason}
            className="flex h-8 w-full items-center rounded-md px-2 text-left transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm truncate flex-1 flex items-center gap-1.5">
                {rec.type === 'new' ? (
                  <FolderPlus className="h-4 w-4 text-ai shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                {stripLeadingFolder(rec.folderPath, barTitle)}
              </span>
              <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                {formatPercent(rec.confidence)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
