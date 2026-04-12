import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Folder, Globe } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export type ToolScope = 'folder' | 'all';
export type ScopeCapability = 'folder' | 'all' | 'both';

type ToolCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: (scope: ToolScope) => void;
  disabled?: boolean;
  isLoading?: boolean;
  scopeCapability: ScopeCapability;
  currentFolderName?: string;
};

export function ToolCard({
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
    scopeCapability === 'all' ? 'all' : 'folder',
  );
  const showScopeSelector = scopeCapability === 'both';

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 rounded-md bg-muted p-1.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium">{title}</h4>
            <ScopeBadge scopeCapability={scopeCapability} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showScopeSelector ? (
          <Select value={scope} onValueChange={(value) => setScope(value as ToolScope)}>
            <SelectTrigger className="h-8 flex-1 text-xs">
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
        ) : null}

        <Button
          variant="secondary"
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

function ScopeBadge({ scopeCapability }: { scopeCapability: ScopeCapability }) {
  if (scopeCapability === 'folder') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
        <Folder className="h-3 w-3" />
      </span>
    );
  }

  if (scopeCapability === 'all') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
        <Globe className="h-3 w-3" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
      <Folder className="h-3 w-3" />
      <span>/</span>
      <Globe className="h-3 w-3" />
    </span>
  );
}
