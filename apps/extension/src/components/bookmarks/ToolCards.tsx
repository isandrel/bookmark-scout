import { Folder, Globe, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';

type ToolCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: (scope: BookmarkToolScope) => void;
  disabled?: boolean;
  isLoading?: boolean;
  scopeCapability: ToolScopeCapability;
  defaultScope: BookmarkToolScope;
  currentFolderName?: string;
  /** Extra tool-specific controls rendered above the scope selector and action button. */
  controls?: React.ReactNode;
  /** Explains why the tool cannot run right now (for example, AI is turned off). */
  notice?: string;
};

function resolveScope(
  capability: ToolScopeCapability,
  configuredDefault: BookmarkToolScope,
): BookmarkToolScope {
  if (capability === 'folder' || capability === 'all') return capability;
  return configuredDefault;
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
  const [selection, setSelection] = useState<{
    defaultScope: BookmarkToolScope;
    scope: BookmarkToolScope;
  } | null>(null);
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
  // Shared by the options and the trigger, which shows the selected option's label.
  const scopeLabels: Record<BookmarkToolScope, React.ReactNode> = {
    folder: (
      <div className="flex items-center gap-2">
        <Folder className="h-3 w-3" />
        <span className="truncate">{currentFolderName || t('settings_scopeFolder')}</span>
      </div>
    ),
    all: (
      <div className="flex items-center gap-2">
        <Globe className="h-3 w-3" />
        <span>{t('settings_scopeAll')}</span>
      </div>
    ),
  };

  return (
    <div className="space-y-2 p-3">
      <ToolCardHeader
        icon={icon}
        title={title}
        description={description}
        notice={notice}
        scopeCapability={scopeCapability}
      />

      {controls ? <div className="flex items-center gap-2">{controls}</div> : null}

      <div className="flex items-center gap-2">
        {showScopeSelector ? (
          <Select
            value={scope}
            onValueChange={(value) => {
              if (value !== null) {
                setSelection({ defaultScope: resolvedDefault, scope: value as BookmarkToolScope });
              }
            }}
            items={scopeLabels}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder={t('tools_scopeSelect')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="folder">{scopeLabels.folder}</SelectItem>
              <SelectItem value="all">{scopeLabels.all}</SelectItem>
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

/** Icon, title, scope badge, and description of a tool card. */
export function ToolCardHeader({
  icon,
  title,
  description,
  notice,
  scopeCapability,
}: Pick<ToolCardProps, 'icon' | 'title' | 'description' | 'notice' | 'scopeCapability'>) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-shrink-0 rounded-md bg-muted p-1.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-medium">{title}</h4>
          <ScopeBadge scopeCapability={scopeCapability} />
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
        {notice ? <p className="mt-1 text-xs font-medium text-warning">{notice}</p> : null}
      </div>
    </div>
  );
}

const SCOPE_ICONS: Record<BookmarkToolScope, LucideIcon> = { folder: Folder, all: Globe };

/** The scopes a badge pictures and the label screen readers hear instead. */
const SCOPE_BADGES = {
  folder: { scopes: ['folder'], labelKey: 'settings_scopeFolder' },
  all: { scopes: ['all'], labelKey: 'settings_scopeAll' },
  both: { scopes: ['folder', 'all'], labelKey: 'settings_scopeBoth' },
} as const satisfies Record<
  ToolScopeCapability,
  { scopes: readonly BookmarkToolScope[]; labelKey: string }
>;

/** The scopes a tool runs on, as icons with an accessible label. */
export function ScopeBadge({ scopeCapability }: { scopeCapability: ToolScopeCapability }) {
  const { scopes, labelKey } = SCOPE_BADGES[scopeCapability];
  return (
    <span
      role="img"
      aria-label={t(labelKey)}
      className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
    >
      {scopes.map((scope, index) => {
        const Icon = SCOPE_ICONS[scope];
        return (
          <Fragment key={scope}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            <Icon className="h-3 w-3" aria-hidden="true" />
          </Fragment>
        );
      })}
    </span>
  );
}
