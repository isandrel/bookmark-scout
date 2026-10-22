import { Folder, Globe, ListChecks, type LucideIcon, Search } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';

type ToolCardProps = {
  /** Element id, for links that open the page on this card. */
  id?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: (scope: ToolRunScope) => void;
  disabled?: boolean;
  isLoading?: boolean;
  scopeCapability: ToolScopeCapability;
  defaultScope: BookmarkToolScope;
  currentFolderName?: string;
  /** What the manager lists now that the tool can run on instead (search results, selection). */
  narrowScopes?: readonly NarrowToolScope[];
  /** Extra tool-specific controls rendered above the scope selector and action button. */
  controls?: React.ReactNode;
  /** Explains why the tool cannot run right now (for example, AI is turned off). */
  notice?: string;
  /** Shown under the action button, such as the tool's background job. */
  footer?: React.ReactNode;
};

function resolveScope(
  capability: ToolScopeCapability,
  configuredDefault: BookmarkToolScope,
): BookmarkToolScope {
  if (capability === 'folder' || capability === 'all') return capability;
  return configuredDefault;
}

export function ToolCard({
  id,
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
  narrowScopes = [],
  controls,
  notice,
  footer,
}: ToolCardProps) {
  const resolvedDefault = resolveScope(scopeCapability, defaultScope);
  const scopes: ToolRunScope[] = [...SCOPE_BADGES[scopeCapability].scopes, ...narrowScopes];
  const [selection, setSelection] = useState<{
    defaultScope: BookmarkToolScope;
    scope: ToolRunScope;
  } | null>(null);
  useEffect(() => {
    setSelection((previous) => (previous?.defaultScope === resolvedDefault ? previous : null));
  }, [resolvedDefault]);
  // A pick the card no longer offers (the search was cleared) falls back to the default.
  const scope =
    selection?.defaultScope === resolvedDefault && scopes.includes(selection.scope)
      ? selection.scope
      : resolvedDefault;
  const showScopeSelector = scopes.length > 1;
  // Shared by the options and the trigger, which shows the selected option's label.
  const scopeLabels: Record<ToolRunScope, React.ReactNode> = {
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
    search: (
      <div className="flex items-center gap-2">
        <Search className="h-3 w-3" />
        <span>{t('tools_scopeSearch')}</span>
      </div>
    ),
    selection: (
      <div className="flex items-center gap-2">
        <ListChecks className="h-3 w-3" />
        <span>{t('tools_scopeSelection')}</span>
      </div>
    ),
  };

  return (
    <div id={id} className="scroll-m-3 space-y-2 p-3">
      <ToolCardHeader
        icon={icon}
        title={title}
        description={description}
        notice={notice}
        scopeCapability={scopeCapability}
      />

      {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}

      <div className="flex items-center gap-2">
        {showScopeSelector ? (
          <Select
            value={scope}
            onValueChange={(value) => {
              if (value !== null) {
                setSelection({ defaultScope: resolvedDefault, scope: value as ToolRunScope });
              }
            }}
            items={scopeLabels}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder={t('tools_scopeSelect')} />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((option) => (
                <SelectItem key={option} value={option}>
                  {scopeLabels[option]}
                </SelectItem>
              ))}
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
      {footer}
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
        {/* Titles and descriptions wrap: long words in German or French are cut off otherwise. */}
        <div className="flex items-start gap-2">
          <h4 className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{title}</h4>
          <ScopeBadge scopeCapability={scopeCapability} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
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
      className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
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
