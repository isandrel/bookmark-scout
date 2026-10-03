/**
 * ToolsSidebar - Right sidebar panel for bookmark tools, matching the left folder sidebar.
 * Every tool comes from `TOOL_DEFINITIONS` and runs through `useToolRun`; the Data section
 * (export and import) follows the tool sections.
 */

import { Wrench } from 'lucide-react';

type ToolSectionProps = {
  title: string;
  children: React.ReactNode;
};

function ToolSection({ title, children }: ToolSectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      {/* Tools are rows in one panel, separated by lines, not a stack of cards. */}
      <div className="divide-y overflow-hidden rounded-lg border bg-card">{children}</div>
    </section>
  );
}

type ToolEntryProps = {
  tool: ToolDefinition;
  environment: ToolEnvironment;
  currentFolderName?: string;
  /** Starts network work once website access is granted. */
  runWithAccess: (start: () => Promise<void>) => void;
};

/** One tool's card and review, driven by its table entry. */
function ToolEntry({ tool, environment, currentFolderName, runWithAccess }: ToolEntryProps) {
  const { state, run, apply, undo, close } = useToolRun(tool, environment);
  const { settings } = environment;
  const aiOff = Boolean(tool.requiresAI) && !settings.aiEnabled;
  const Review = TOOL_REVIEWS[tool.id] as
    | ((props: ToolReviewProps<ToolId>) => React.ReactNode)
    | undefined;
  const Controls = TOOL_CONTROLS[tool.id];
  const Icon = tool.icon;

  return (
    <>
      <ToolCard
        icon={<Icon className="h-4 w-4 text-muted-foreground" />}
        title={t(tool.titleKey)}
        description={t(tool.descriptionKey)}
        buttonLabel={t(tool.actionKey(settings))}
        onClick={(scope) => {
          if (tool.needsHostAccess) runWithAccess(() => run(scope));
          else void run(scope);
        }}
        disabled={aiOff}
        notice={aiOff ? t('ai_featuresDisabledNotice') : undefined}
        scopeCapability={getToolScopeCapability(tool.id)}
        defaultScope={getToolDefaultScope(settings, tool)}
        currentFolderName={currentFolderName}
        isLoading={state.phase === 'scanning'}
        controls={Controls ? <Controls /> : undefined}
      />
      {Review ? (
        <Review
          tool={tool as ToolDefinitions[ToolId]}
          state={state as ToolRunState<ToolResults[ToolId]>}
          apply={apply as (selection: ToolSelections[ToolId]) => Promise<void>}
          undo={undo}
          close={close}
          onChanged={environment.refresh}
        />
      ) : null}
    </>
  );
}

interface ToolsSidebarProps {
  currentFolderId: string | null;
  currentFolderName?: string;
}

export function ToolsSidebar({ currentFolderId, currentFolderName }: ToolsSidebarProps) {
  const { folders, refresh } = useBookmarks();
  const { settings, isLoading } = useSettings();
  const exportPrivacyReview = useExportPrivacyReview();
  const hostAccess = useWebHostAccessGate();
  const environment: ToolEnvironment = {
    settings,
    folders,
    currentFolderId,
    refresh,
    saveFile: exportPrivacyReview.reviewBeforeExport,
  };
  const showData = settings.dataShowExport || settings.dataShowImport;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center border-b px-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          {t('tools_title')}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? null : (
          <div className="space-y-5 p-3">
            {TOOL_SECTIONS.map((section) => {
              const tools = getSectionTools(settings, section.id);
              return tools.length ? (
                <ToolSection key={section.id} title={t(section.titleKey)}>
                  {tools.map((tool) => (
                    <ToolEntry
                      key={tool.id}
                      tool={tool}
                      environment={environment}
                      currentFolderName={currentFolderName}
                      runWithAccess={hostAccess.runWithAccess}
                    />
                  ))}
                </ToolSection>
              ) : null;
            })}

            {showData ? (
              <ToolSection title={t('tools_category_data')}>
                {settings.dataShowExport ? (
                  <ExportToolCard environment={environment} currentFolderName={currentFolderName} />
                ) : null}
                {settings.dataShowImport ? <ImportToolCard environment={environment} /> : null}
              </ToolSection>
            ) : null}
          </div>
        )}
      </div>

      <WebHostAccessDialog {...hostAccess.dialogProps} />
      <ExportPrivacyReviewDialog {...exportPrivacyReview.dialogProps} />
    </div>
  );
}

/** Explains the optional website access before the first network scan. */
function WebHostAccessDialog({
  open,
  onAllow,
  onCancel,
}: {
  open: boolean;
  onAllow: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tools_hostAccessTitle')}</DialogTitle>
          <DialogDescription>{t('tools_hostAccessDesc')}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('tools_hostAccessPrivacy')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('action_notNow')}
          </Button>
          <Button onClick={onAllow}>{t('action_allowAccess')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
