/**
 * AI Reorganization Dialog
 * A user-friendly modal for previewing and applying AI-suggested folder reorganization.
 * Shows clear diff of changes before applying.
 */

import { useState } from 'react';
import { 
  FolderPlus, 
  FolderMinus, 
  FolderPen, 
  ArrowRight, 
  Sparkles, 
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  Code2,
} from 'lucide-react';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

export type LoadingStatus = 'idle' | 'collecting' | 'sending' | 'waiting' | 'processing';

const LOADING_STATUS_COPY: Record<
  Exclude<LoadingStatus, 'idle'>,
  { icon: string; titleKey: string; detailKey: string }
> = {
  collecting: {
    icon: '📚',
    titleKey: 'ai_reorgStatusCollecting',
    detailKey: 'ai_reorgStatusCollectingDesc',
  },
  sending: { icon: '📤', titleKey: 'ai_reorgStatusSending', detailKey: 'ai_reorgStatusSendingDesc' },
  waiting: { icon: '🤖', titleKey: 'ai_reorgStatusWaiting', detailKey: 'ai_reorgStatusWaitingDesc' },
  processing: {
    icon: '⚙️',
    titleKey: 'ai_reorgStatusProcessing',
    detailKey: 'ai_reorgStatusProcessingDesc',
  },
};

interface ReorganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: ReorganizationPlan | null;
  isLoading: boolean;
  loadingStatus?: LoadingStatus;
  onApply: () => Promise<void>;
  onCancel: () => void;
  errors?: string[];
}

/**
 * Render a single operation with before → after diff
 */
function OperationItem({ op }: { op: ReorganizationOperation }) {
  const getIcon = () => {
    switch (op.type) {
      case 'create':
        return <FolderPlus className="h-4 w-4 text-success" />;
      case 'delete':
        return <FolderMinus className="h-4 w-4 text-destructive-text" />;
      case 'rename':
        return <FolderPen className="h-4 w-4 text-warning" />;
      case 'move':
        return <ArrowRight className="h-4 w-4 text-primary" />;
    }
  };

  const getBadgeVariant = () => {
    switch (op.type) {
      case 'create': return 'default';
      case 'delete': return 'destructive';
      case 'rename': return 'secondary';
      case 'move': return 'outline';
    }
  };

  const renderContent = () => {
    switch (op.type) {
      case 'create':
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-success font-medium">
                + {op.name}
              </span>
              {op.parentPath && (
                <span className="text-xs text-muted-foreground">
                  {t('ai_reorgInFolder', op.parentPath)}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{op.description}</span>
          </div>
        );
      case 'delete':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-destructive-text line-through">
              {op.folderPath}
            </span>
            <span className="text-xs text-muted-foreground">{op.reason}</span>
          </div>
        );
      case 'rename':
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground line-through">{op.oldName}</span>
              <ArrowRight className="h-3 w-3" />
              <span className="text-warning font-medium">
                {op.newName}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{op.reason}</span>
          </div>
        );
      case 'move': {
        // Strip "Bookmarks Bar/" prefix for cleaner display
        const stripPrefix = (path: string) => path.replace(/^Bookmarks Bar\//, '');
        const fromPath = stripPrefix(op.fromFolderPath) || t('tools_rootFolder');
        const toPath = stripPrefix(op.toFolderPath);
        return (
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
                <span className="text-muted-foreground text-xs w-10 flex-shrink-0">{t('ai_reorgFrom')}</span>
                <span className="text-destructive-text truncate" title={fromPath}>
                  {fromPath}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-10 flex-shrink-0">{t('ai_reorgTo')}</span>
                <span className="text-success truncate" title={toPath}>
                  {toPath}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground flex-1">{op.reason}</span>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {Math.round(op.confidence * 100)}%
              </Badge>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={getBadgeVariant()} className="text-xs">
            {t(`ai_reorgOp_${op.type}`)}
          </Badge>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}

export function ReorganizationDialog({
  open,
  onOpenChange,
  plan,
  isLoading,
  loadingStatus,
  onApply,
  onCancel,
  errors = [],
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

  const getSummaryStats = () => {
    if (!plan) return { creates: 0, deletes: 0, renames: 0, moves: 0 };
    return {
      creates: plan.operations.filter(o => o.type === 'create').length,
      deletes: plan.operations.filter(o => o.type === 'delete').length,
      renames: plan.operations.filter(o => o.type === 'rename').length,
      moves: plan.operations.filter(o => o.type === 'move').length,
    };
  };

  const stats = getSummaryStats();
  const activeStatus =
    loadingStatus && loadingStatus !== 'idle' ? LOADING_STATUS_COPY[loadingStatus] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-ai" />
            {t('ai_reorganizationTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('ai_reorganizationDesc')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-ai" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {activeStatus
                    ? `${activeStatus.icon} ${t(activeStatus.titleKey)}`
                    : t('ai_analyzing')}
                </p>
                {activeStatus ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(activeStatus.detailKey)}
                  </p>
                ) : null}
              </div>
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
              <div className="flex flex-wrap gap-2">
                {stats.creates > 0 && (
                  <Badge variant="default" className="gap-1">
                    <FolderPlus className="h-3 w-3" />
                    {t('ai_reorgNewFolders', String(stats.creates))}
                  </Badge>
                )}
                {stats.deletes > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <FolderMinus className="h-3 w-3" />
                    {t('ai_reorgFoldersToRemove', String(stats.deletes))}
                  </Badge>
                )}
                {stats.renames > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <FolderPen className="h-3 w-3" />
                    {t('ai_reorgRenames', String(stats.renames))}
                  </Badge>
                )}
                {stats.moves > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <ArrowRight className="h-3 w-3" />
                    {t('ai_reorgMoves', String(stats.moves))}
                  </Badge>
                )}
              </div>

              {/* AI Summary */}
              <div className="px-3 py-2 rounded-lg bg-ai/10 border border-ai/30">
                <p className="text-sm text-foreground">
                  {plan.summary}
                </p>
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
                    {plan.operations.map((op, index) => (
                      <OperationItem key={index} op={op} />
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
              <p className="text-sm text-muted-foreground">
                {t('ai_noChangesNeeded')}
              </p>
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
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('ai_reorgSystemPrompt')}</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {plan.debugData.systemPrompt}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('ai_reorgRequestData')}</p>
                  <div className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                    <JsonView data={plan.debugData.request as object} style={darkStyles} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('ai_reorgResponse')}</p>
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
