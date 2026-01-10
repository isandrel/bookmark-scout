/**
 * AI Reorganization Dialog
 * A user-friendly modal for previewing and applying AI-suggested folder reorganization.
 * Shows clear diff of changes before applying.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import type { ReorganizationPlan, ReorganizationOperation } from '@/services';
import { t } from '@/hooks/use-i18n';

export type LoadingStatus = 'idle' | 'collecting' | 'sending' | 'waiting' | 'processing';

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
        return <FolderPlus className="h-4 w-4 text-green-500" />;
      case 'delete':
        return <FolderMinus className="h-4 w-4 text-red-500" />;
      case 'rename':
        return <FolderPen className="h-4 w-4 text-yellow-500" />;
      case 'move':
        return <ArrowRight className="h-4 w-4 text-blue-500" />;
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
              <span className="text-green-600 dark:text-green-400 font-medium">
                + {op.name}
              </span>
              {op.parentPath && (
                <span className="text-xs text-muted-foreground">
                  in {op.parentPath}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{op.description}</span>
          </div>
        );
      case 'delete':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-red-600 dark:text-red-400 line-through">
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
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                {op.newName}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{op.reason}</span>
          </div>
        );
      case 'move': {
        // Strip "Bookmarks Bar/" prefix for cleaner display
        const stripPrefix = (path: string) => path.replace(/^Bookmarks Bar\//, '');
        const fromPath = stripPrefix(op.fromFolderPath) || '(root)';
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
                <span className="text-muted-foreground text-xs w-10 flex-shrink-0">From:</span>
                <span className="text-red-500 dark:text-red-400 truncate" title={fromPath}>
                  {fromPath}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-10 flex-shrink-0">To:</span>
                <span className="text-green-500 dark:text-green-400 truncate" title={toPath}>
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
          <Badge variant={getBadgeVariant()} className="text-xs capitalize">
            {op.type}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {t('ai_reorganizationTitle') || 'AI Folder Reorganization'}
          </DialogTitle>
          <DialogDescription>
            {t('ai_reorganizationDesc') || 'Review the suggested changes before applying. No changes will be made until you approve.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {loadingStatus === 'collecting' && '📚 Collecting bookmarks...'}
                  {loadingStatus === 'sending' && '📤 Sending to AI...'}
                  {loadingStatus === 'waiting' && '🤖 AI is analyzing your bookmarks...'}
                  {loadingStatus === 'processing' && '⚙️ Processing suggestions...'}
                  {(!loadingStatus || loadingStatus === 'idle') && 'Analyzing bookmarks...'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {loadingStatus === 'collecting' && 'Gathering folder structure and bookmark data'}
                  {loadingStatus === 'sending' && 'Preparing request for AI analysis'}
                  {loadingStatus === 'waiting' && 'This may take 10-30 seconds'}
                  {loadingStatus === 'processing' && 'Building reorganization plan'}
                </p>
              </div>
            </div>
          </div>
        ) : errors.length > 0 ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 max-w-md">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  <p className="font-medium mb-1">Error</p>
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
                    {stats.creates} new {stats.creates === 1 ? 'folder' : 'folders'}
                  </Badge>
                )}
                {stats.deletes > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <FolderMinus className="h-3 w-3" />
                    {stats.deletes} {stats.deletes === 1 ? 'folder' : 'folders'} to remove
                  </Badge>
                )}
                {stats.renames > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <FolderPen className="h-3 w-3" />
                    {stats.renames} {stats.renames === 1 ? 'rename' : 'renames'}
                  </Badge>
                )}
                {stats.moves > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <ArrowRight className="h-3 w-3" />
                    {stats.moves} bookmark {stats.moves === 1 ? 'move' : 'moves'}
                  </Badge>
                )}
              </div>

              {/* AI Summary */}
              <div className="px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-purple-800 dark:text-purple-200">
                  {plan.summary}
                </p>
              </div>

              {/* Operations List - Collapsible */}
              <Collapsible className="border rounded-lg">
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    <span>View {plan.operations.length} Operations</span>
                  </div>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
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
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p className="text-sm text-muted-foreground">
                {t('ai_noChangesNeeded') || 'Your bookmarks are already well organized!'}
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
                <span>View AI Request & Response</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">System Prompt:</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {plan.debugData.systemPrompt}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Request Data:</p>
                  <div className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                    <JsonView data={plan.debugData.request as object} style={darkStyles} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">AI Response:</p>
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
            Cancel
          </Button>
          {plan && plan.operations.length > 0 && (
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Apply Changes
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
