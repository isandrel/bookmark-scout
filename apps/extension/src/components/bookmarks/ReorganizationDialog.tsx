/**
 * AI Reorganization Dialog
 * Previews the AI-suggested bookmark moves before they are applied.
 */

import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  Code2,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { darkStyles, JsonView } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

interface ReorganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: ReorganizationPlan | null;
  isLoading: boolean;
  onApply: () => Promise<void>;
  onCancel: () => void;
  errors?: string[];
  /**
   * The bookmarks bar's title in this browser. Plan paths start with it, so it is left out of
   * the shown paths.
   */
  bookmarksBarTitle?: string;
}

/**
 * Render a single move with its from and to folders
 */
function OperationItem({
  op,
  bookmarksBarTitle,
}: {
  op: ReorganizationOperation;
  bookmarksBarTitle?: string;
}) {
  const fromPath =
    stripLeadingFolder(op.fromFolderPath, bookmarksBarTitle) || t('tools_rootFolder');
  const toPath = stripLeadingFolder(op.toFolderPath, bookmarksBarTitle);
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <ArrowRight className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {t('ai_reorgOp_move')}
          </Badge>
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-medium truncate" title={op.bookmarkTitle}>
            {op.bookmarkTitle}
          </div>
          {op.bookmarkUrl && (
            <div className="text-xs text-muted-foreground truncate" title={op.bookmarkUrl}>
              {op.bookmarkUrl}
            </div>
          )}
          {/* Stacked layout for From → To paths */}
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs w-10 flex-shrink-0">
                {t('ai_reorgFrom')}
              </span>
              <span className="text-destructive-text truncate" title={fromPath}>
                {fromPath}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs w-10 flex-shrink-0">
                {t('ai_reorgTo')}
              </span>
              <span className="text-success truncate" title={toPath}>
                {toPath}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground flex-1">{op.reason}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {formatPercent(op.confidence)}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReorganizationDialog({
  open,
  onOpenChange,
  plan,
  isLoading,
  onApply,
  onCancel,
  errors = [],
  bookmarksBarTitle,
}: ReorganizationDialogProps) {
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-ai" />
            {t('tools_aiReorganize')}
          </DialogTitle>
          <DialogDescription>{t('ai_reorganizationDesc')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-ai" />
              <p className="text-sm font-medium">{t('ai_analyzing')}</p>
            </div>
          </div>
        ) : errors.length > 0 ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="px-4 py-3 rounded-lg bg-destructive-wash border border-destructive/40 max-w-md">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive-text flex-shrink-0 mt-0.5" />
                <div className="text-sm text-destructive-text">
                  <p className="font-medium mb-1">{t('error_generic')}</p>
                  {errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : plan ? (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-4">
              {/* Summary Stats */}
              {plan.operations.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1">
                    <ArrowRight className="h-3 w-3" />
                    {t('ai_reorgMoves', String(plan.operations.length))}
                  </Badge>
                </div>
              )}

              {/* AI Summary */}
              <div className="px-3 py-2 rounded-lg bg-ai/10 border border-ai/30">
                <p className="text-sm text-foreground">{plan.summary}</p>
              </div>

              {/* Operations List - Collapsible */}
              <Collapsible className="border rounded-lg">
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    <span>{t('ai_reorgViewOperations', String(plan.operations.length))}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 data-open:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                  <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                    {plan.operations.map((op) => (
                      <OperationItem
                        key={op.bookmarkId}
                        op={op}
                        bookmarksBarTitle={bookmarksBarTitle}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-8 w-8 text-success" />
              <p className="text-sm text-muted-foreground">{t('ai_noChangesNeeded')}</p>
            </div>
          </div>
        )}

        {/* Debug: AI Request/Response */}
        {plan?.debugData && (
          <Collapsible className="border rounded-lg">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Code2 className="h-4 w-4" />
                <span>{t('ai_reorgDebugToggle')}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 data-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('ai_reorgSystemPrompt')}
                  </p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {plan.debugData.systemPrompt}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('ai_reorgRequestData')}
                  </p>
                  <div className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                    <JsonView data={plan.debugData.request as object} style={darkStyles} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('ai_reorgResponse')}
                  </p>
                  <div className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                    <JsonView data={plan.debugData.response as object} style={darkStyles} />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isApplying}>
            {t('action_cancel')}
          </Button>
          {plan && plan.operations.length > 0 && (
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('ai_applying')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('ai_applyChanges')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
