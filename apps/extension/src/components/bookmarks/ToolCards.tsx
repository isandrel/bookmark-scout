import { Folder, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  defaultScope: ScopeCapability;
  currentFolderName?: string;
  /** Extra tool-specific controls rendered above the scope selector and action button. */
  controls?: React.ReactNode;
  /** Explains why the tool cannot run right now (for example, AI is turned off). */
  notice?: string;
};

function resolveScope(capability: ScopeCapability, configuredDefault: ScopeCapability): ToolScope {
  if (capability === 'folder' || capability === 'all') return capability;
  return configuredDefault === 'all' ? 'all' : 'folder';
}

export function ToolCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  disabled = false,
  isLoading = false,
  scopeCapability,
  defaultScope,
  currentFolderName,
  controls,
  notice,
}: ToolCardProps) {
  const resolvedDefault = resolveScope(scopeCapability, defaultScope);
  const [selection, setSelection] = useState<{ defaultScope: ToolScope; scope: ToolScope } | null>(
    null,
  );
  useEffect(() => {
    setSelection((previous) =>
      scopeCapability === 'both' && previous?.defaultScope === resolvedDefault ? previous : null,
    );
  }, [resolvedDefault, scopeCapability]);
  const scope =
    scopeCapability === 'both' && selection?.defaultScope === resolvedDefault
      ? selection.scope
      : resolvedDefault;
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
          {notice ? <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">{notice}</p> : null}
        </div>
      </div>

      {controls ? <div className="flex items-center gap-2">{controls}</div> : null}

      <div className="flex items-center gap-2">
        {showScopeSelector ? (
          <Select
            value={scope}
            onValueChange={(value) =>
              setSelection({ defaultScope: resolvedDefault, scope: value as ToolScope })
            }
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder={t('tools_scopeSelect')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="folder">
                <div className="flex items-center gap-2">
                  <Folder className="h-3 w-3" />
                  <span className="truncate">{currentFolderName || t('settings_scopeFolder')}</span>
                </div>
              </SelectItem>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  <span>{t('settings_scopeAll')}</span>
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
          {isLoading ? t('tools_running') : buttonLabel}
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
