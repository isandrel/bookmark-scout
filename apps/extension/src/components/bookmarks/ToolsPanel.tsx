/**
 * ToolsPanel - Collapsible panel for power-user tools.
 * Includes dead link checker, AI folder reorganization, and statistics.
 */

import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronRight,
  Link2Off,
  Sparkles,
  BarChart3,
  Wrench,
} from 'lucide-react';
import { t } from '@/hooks/use-i18n';

interface ToolCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

function ToolCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  disabled = false,
  isLoading = false,
}: ToolCardProps) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
      <div className="flex-shrink-0 p-2 rounded-md bg-muted">{icon}</div>
      <div className="flex-1 space-y-1">
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled || isLoading}
      >
        {isLoading ? 'Running...' : buttonLabel}
      </Button>
    </div>
  );
}

export function ToolsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const handleCheckDeadLinks = () => {
    // TODO: Implement dead link checker
    console.log('Check dead links clicked');
  };

  const handleAIReorganize = () => {
    // TODO: Implement AI folder reorganization
    console.log('AI reorganize clicked');
  };

  const handleShowStatistics = () => {
    // TODO: Implement bookmark statistics
    console.log('Show statistics clicked');
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 w-full justify-start px-4 py-2 hover:bg-muted/50"
        >
          <Wrench className="h-4 w-4" />
          <span className="font-medium">{t('tools_title') || 'Tools'}</span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 ml-auto" />
          ) : (
            <ChevronRight className="h-4 w-4 ml-auto" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-4 pb-4">
        <ToolCard
          icon={<Link2Off className="h-5 w-5 text-orange-500" />}
          title={t('tools_checkDeadLinks') || 'Check Dead Links'}
          description={
            t('tools_checkDeadLinksDesc') ||
            'Scan bookmarks for broken or unreachable URLs'
          }
          buttonLabel={t('action_scan') || 'Scan'}
          onClick={handleCheckDeadLinks}
          disabled
        />
        <ToolCard
          icon={<Sparkles className="h-5 w-5 text-purple-500" />}
          title={t('tools_aiReorganize') || 'AI Folder Reorganization'}
          description={
            t('tools_aiReorganizeDesc') ||
            'Use AI to suggest a better folder structure'
          }
          buttonLabel={t('action_analyze') || 'Analyze'}
          onClick={handleAIReorganize}
          disabled
        />
        <ToolCard
          icon={<BarChart3 className="h-5 w-5 text-blue-500" />}
          title={t('tools_statistics') || 'Bookmark Statistics'}
          description={
            t('tools_statisticsDesc') ||
            'View stats about your bookmarks collection'
          }
          buttonLabel={t('action_view') || 'View'}
          onClick={handleShowStatistics}
          disabled
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
