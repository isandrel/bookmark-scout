/**
 * ToolsSidebar - Right sidebar panel for bookmark tools.
 * Matches the left folder sidebar design.
 * Features scope selection (current folder vs all bookmarks) based on tool capabilities.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Link2Off,
  Sparkles,
  BarChart3,
  Wrench,
  Globe,
  Folder,
} from 'lucide-react';
import { t } from '@/hooks/use-i18n';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type ToolScope = 'folder' | 'all';
type ScopeCapability = 'folder' | 'all' | 'both';

interface ToolCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: (scope: ToolScope) => void;
  disabled?: boolean;
  isLoading?: boolean;
  scopeCapability: ScopeCapability;
  currentFolderName?: string;
}

function ToolCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  disabled = false,
  isLoading = false,
  scopeCapability,
  currentFolderName,
}: ToolCardProps) {
  const [scope, setScope] = useState<ToolScope>(
    scopeCapability === 'all' ? 'all' : 'folder'
  );

  const showScopeSelector = scopeCapability === 'both';

  // Scope badge indicator
  const ScopeBadge = () => {
    if (scopeCapability === 'folder') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          <Folder className="h-3 w-3" />
        </span>
      );
    }
    if (scopeCapability === 'all') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          <Globe className="h-3 w-3" />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
        <Folder className="h-3 w-3" />
        <span>/</span>
        <Globe className="h-3 w-3" />
      </span>
    );
  };

  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 p-1.5 rounded-md bg-muted">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate">{title}</h4>
            <ScopeBadge />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showScopeSelector && (
          <Select value={scope} onValueChange={(v) => setScope(v as ToolScope)}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="folder">
                <div className="flex items-center gap-2">
                  <Folder className="h-3 w-3" />
                  <span className="truncate">{currentFolderName || 'Current Folder'}</span>
                </div>
              </SelectItem>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  <span>All Bookmarks</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={() => onClick(scope)}
          disabled={disabled || isLoading}
          className={cn('h-8 text-xs', !showScopeSelector && 'w-full')}
        >
          {isLoading ? 'Running...' : buttonLabel}
        </Button>
      </div>
    </div>
  );
}

interface ToolsSidebarProps {
  currentFolderId: string | null;
  currentFolderName?: string;
}

export function ToolsSidebar({ currentFolderId, currentFolderName }: ToolsSidebarProps) {
  const handleCheckDeadLinks = (scope: ToolScope) => {
    console.log('Check dead links:', scope, currentFolderId);
    // TODO: Implement dead link checker
  };

  const handleAIReorganize = (scope: ToolScope) => {
    console.log('AI reorganize:', scope, currentFolderId);
    // TODO: Implement AI folder reorganization
  };

  const handleShowStatistics = (scope: ToolScope) => {
    console.log('Show statistics:', scope);
    // TODO: Implement bookmark statistics
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b">
        <h2 className="text-sm font-semibold px-2 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          {t('tools_title') || 'Tools'}
        </h2>
      </div>

      {/* Scope Legend */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1">
            <Folder className="h-3 w-3" /> Folder
          </span>
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" /> All
          </span>
          <span className="flex items-center gap-1">
            <Folder className="h-3 w-3" />/<Globe className="h-3 w-3" /> Choose
          </span>
        </div>
      </div>

      {/* Tool Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <ToolCard
          icon={<Link2Off className="h-4 w-4 text-orange-500" />}
          title={t('tools_checkDeadLinks') || 'Check Dead Links'}
          description={
            t('tools_checkDeadLinksDesc') ||
            'Scan for broken or unreachable URLs'
          }
          buttonLabel={t('action_scan') || 'Scan'}
          onClick={handleCheckDeadLinks}
          scopeCapability="both"
          currentFolderName={currentFolderName}
          disabled
        />

        <ToolCard
          icon={<Sparkles className="h-4 w-4 text-purple-500" />}
          title={t('tools_aiReorganize') || 'AI Reorganization'}
          description={
            t('tools_aiReorganizeDesc') ||
            'Use AI to suggest better folder structure'
          }
          buttonLabel={t('action_analyze') || 'Analyze'}
          onClick={handleAIReorganize}
          scopeCapability="folder"
          currentFolderName={currentFolderName}
          disabled
        />

        <ToolCard
          icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
          title={t('tools_statistics') || 'Statistics'}
          description={
            t('tools_statisticsDesc') ||
            'View stats about your bookmarks'
          }
          buttonLabel={t('action_view') || 'View'}
          onClick={handleShowStatistics}
          scopeCapability="both"
          currentFolderName={currentFolderName}
          disabled
        />
      </div>
    </div>
  );
}
