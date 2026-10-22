/**
 * ToolsSidebar - Right sidebar panel for bookmark tools, matching the left folder sidebar.
 * Every tool comes from `TOOL_DEFINITIONS` and runs through `useToolRun`; the Data section
 * (export and import) follows the tool sections.
 */

import { Wrench } from 'lucide-react';
import { memo, useEffect, useId, useState } from 'react';

/** The tab each card a link can open on (`#<id>` in the manager's address) is in. */
const HASH_TABS: Readonly<Record<string, ToolSidebarTab>> = { [MANAGER_EXPORT_HASH]: 'data' };

type ToolSectionProps = {
  title: string;
  /** Hidden while another tab shows; it stays mounted, so a running tool keeps its review. */
  hidden?: boolean;
  children: React.ReactNode;
};

function ToolSection({ title, hidden, children }: ToolSectionProps) {
  return (
    <section className="space-y-2" hidden={hidden}>
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
  /** Starts network work once access to `sites` (or all websites) is granted. */
  runWithAccess: (start: () => Promise<void>, sites: string[]) => void;
};

/**
 * Whether an AI tool can start: off while the setting is off or, in Firefox, while data sharing
 * for AI is not allowed; on but without a usable default service, the notice says to finish the
 * setup instead of failing on click.
 */
function useToolAIGate(tool: ToolDefinition): { blocked: boolean; notice?: string } {
  const aiSetup = useAISetup(tool.aiFeature);
  const blocked = Boolean(tool.aiFeature) && aiSetup !== 'ready';
  // With only the built-in model, which does not run tools, say what is missing.
  const { service: defaultService } = useAIFeatureService();
  const needsOtherService =
    defaultService !== undefined &&
    tool.aiFeature !== undefined &&
    !providerSupportsFeature(defaultService.provider, tool.aiFeature);
  if (!blocked || aiSetup === 'loading') return { blocked };
  const notice =
    aiSetup !== 'needsSetup'
      ? t('ai_featuresDisabledNotice')
      : needsOtherService
        ? t('builtinAi_needsOtherService')
        : t('aiOnboard_setupNotice');
  return { blocked, notice };
}

/**
 * A tool that runs as a background job: the card starts it with the scope frozen now, shows the
 * newest job of its kind (also one started from another page), and opens the review on its saved
 * results, where applying and undo work as after a scan. Closing the page or the review never
 * stops the job.
 */
function JobToolEntry({
  tool,
  job: jobTool,
  environment,
  currentFolderName,
  runWithAccess,
}: ToolEntryProps & { job: NonNullable<ToolDefinition['job']> }) {
  const job = useLatestJob(jobTool.kind);
  const { state, review, apply, undo, close } = useToolRun(tool, environment);
  const aiGate = useToolAIGate(tool);
  // The job this page started: its review opens once it finishes while the page is open, as a
  // scan did; closing the page first leaves the results for Review results.
  const [watching, setWatching] = useState<string | null>(null);
  const { settings } = environment;
  const Controls = TOOL_CONTROLS[tool.id];
  const Icon = tool.icon;
  const start = async (scope: BookmarkToolScope) => {
    const folderId = environment.currentFolderId;
    const response = await sendJobCommand({
      type: 'start',
      // A new id per click: each click is a new run.
      commandId: crypto.randomUUID(),
      kind: jobTool.kind,
      source: 'manager',
      scope: scope === 'folder' && folderId ? { mode: 'folder', folderId } : { mode: 'all' },
    }).catch(() => undefined);
    if (!response?.ok) toast.error({ title: t('jobs_commandFailed') });
    else setWatching(response.job?.id ?? null);
  };
  const openReview = async (shown: JobRecord) => {
    const results = await readJobResults(shown.id);
    review(jobTool.result(shown, results), shown.scope.mode);
  };
  useEffect(() => {
    // A paused job is still this page's: resumed here, its review opens when it finishes.
    if (!job || job.id !== watching || isJobActive(job) || job.state === 'paused') return;
    setWatching(null);
    if (job.state === 'succeeded' || job.state === 'partial') void openReview(job);
  });

  return (
    <>
      <ToolCard
        icon={<Icon className="h-4 w-4 text-muted-foreground" />}
        title={t(tool.titleKey)}
        description={t(tool.descriptionKey)}
        buttonLabel={t(tool.actionKey(settings))}
        onClick={(scope) => {
          if (!tool.needsHostAccess) {
            void start(scope);
            return;
          }
          // Access only to the sites this run requests: the same nodes the job reads.
          const nodes = getScopedNodes(environment.folders, environment.currentFolderId, scope);
          const urls = flattenBookmarks(nodes).flatMap(({ node }) => node.url ?? []);
          runWithAccess(() => start(scope), getUrlSites(urls));
        }}
        disabled={aiGate.blocked}
        notice={aiGate.notice}
        scopeCapability={getToolScopeCapability(tool.id)}
        defaultScope={getToolDefaultScope(settings, tool, environment.currentFolderId)}
        currentFolderName={currentFolderName}
        isLoading={job ? isJobActive(job) : false}
        controls={Controls ? <Controls /> : undefined}
        footer={
          job ? (
            <JobStatus job={job} showTitle={false} onReview={() => void openReview(job)} />
          ) : null
        }
      />
      <ToolReview
        tool={tool as ToolDefinitions[ToolId]}
        state={state as ToolRunState<ToolResults[ToolId]>}
        apply={apply as (selection: ToolSelections[ToolId]) => Promise<void>}
        undo={undo}
        close={close}
        environment={environment}
      />
    </>
  );
}

/** One tool's card and review, driven by its table entry. */
function ToolEntry(props: ToolEntryProps) {
  return props.tool.job ? (
    <JobToolEntry {...props} job={props.tool.job} />
  ) : (
    <ScanToolEntry {...props} />
  );
}

/** A tool that scans while its page is open. */
function ScanToolEntry({ tool, environment, currentFolderName, runWithAccess }: ToolEntryProps) {
  const { state, run, apply, undo, close } = useToolRun(tool, environment);
  const { settings } = environment;
  const aiGate = useToolAIGate(tool);
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
          if (tool.needsHostAccess) {
            // Access only to the sites this run requests: the same nodes the scan reads.
            const nodes = getScopedNodes(environment.folders, environment.currentFolderId, scope);
            const urls = flattenBookmarks(nodes).flatMap(({ node }) => node.url ?? []);
            runWithAccess(() => run(scope), getUrlSites(urls));
          } else void run(scope);
        }}
        disabled={aiGate.blocked}
        notice={aiGate.notice}
        scopeCapability={getToolScopeCapability(tool.id)}
        defaultScope={getToolDefaultScope(settings, tool, environment.currentFolderId)}
        currentFolderName={currentFolderName}
        isLoading={state.phase === 'scanning'}
        controls={Controls ? <Controls /> : undefined}
      />
      <ToolReview
        tool={tool as ToolDefinitions[ToolId]}
        state={state as ToolRunState<ToolResults[ToolId]>}
        apply={apply as (selection: ToolSelections[ToolId]) => Promise<void>}
        undo={undo}
        close={close}
        environment={environment}
      />
    </>
  );
}

interface ToolsSidebarProps {
  currentFolderId: string | null;
  currentFolderName?: string;
}

// Memoized: the page re-renders on every keystroke of the title search (it is in the address).
// A memoized component skips the page's language re-render, so it follows the language itself.
export const ToolsSidebar = memo(function ToolsSidebar({
  currentFolderId,
  currentFolderName,
}: ToolsSidebarProps) {
  useLanguageRevision();
  const { folders, refresh } = useBookmarks();
  const { settings, isLoading } = useSettings();
  const exportPrivacyReview = useExportPrivacyReview();
  const hostAccess = usePermissionGate('webAccess');
  const environment: ToolEnvironment = {
    settings,
    folders,
    currentFolderId,
    refresh,
    saveFile: exportPrivacyReview.reviewBeforeExport,
  };
  const showData = settings.dataShowExport || settings.dataShowImport;
  // Tabs for the sections that have tools to show, then Data, after All.
  const sections = TOOL_SECTIONS.map((section) => ({
    ...section,
    tools: getSectionTools(settings, section.id),
  })).filter((section) => section.tools.length > 0);
  const tabs: { id: ToolSidebarTab; label: string }[] = [
    { id: 'all', label: t('tools_tabAll') },
    ...sections.map((section) => ({ id: section.id, label: t(section.titleKey) })),
    ...(showData ? [{ id: 'data' as const, label: t('tools_category_data') }] : []),
  ];
  // A link to a card (the manager's address ends in its id) opens on the card's tab.
  const [pickedTab, setPickedTab] = useState<ToolSidebarTab>(
    () => HASH_TABS[window.location.hash.slice(1)] ?? TOOL_SIDEBAR_DEFAULT_TAB,
  );
  const useTabs = settings.toolsSidebarLayout === 'tabs';
  // A tab whose tools were all turned off falls back to the first tab after All.
  const tab = !useTabs
    ? 'all'
    : tabs.some((entry) => entry.id === pickedTab)
      ? pickedTab
      : (tabs[1]?.id ?? 'all');
  const shows = (id: ToolSidebarTab) => tab === 'all' || tab === id;
  const tabsLabelId = useId();

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
            {useTabs ? (
              <div data-testid="tools-tabs">
                <span id={tabsLabelId} className="sr-only">
                  {t('tools_tabsLabel')}
                </span>
                <SegmentedControl
                  aria-labelledby={tabsLabelId}
                  value={tab}
                  options={tabs.map((entry) => ({ value: entry.id, label: entry.label }))}
                  className="h-auto w-full flex-wrap"
                  onValueChange={(value) => setPickedTab(value as ToolSidebarTab)}
                />
              </div>
            ) : null}
            {sections.map((section) => {
              const tools = section.tools;
              return (
                <ToolSection
                  key={section.id}
                  title={t(section.titleKey)}
                  hidden={!shows(section.id)}
                >
                  {tools.map((tool) => (
                    <ToolEntry
                      key={tool.id}
                      tool={tool}
                      environment={environment}
                      currentFolderName={currentFolderName}
                      runWithAccess={(start, sites) => void hostAccess.run(start, sites)}
                    />
                  ))}
                </ToolSection>
              );
            })}

            {showData ? (
              <ToolSection title={t('tools_category_data')} hidden={!shows('data')}>
                {settings.dataShowExport ? (
                  <ExportToolCard environment={environment} currentFolderName={currentFolderName} />
                ) : null}
                {settings.dataShowImport ? <ImportToolCard environment={environment} /> : null}
              </ToolSection>
            ) : null}
          </div>
        )}
      </div>

      <PermissionDialog {...hostAccess.dialogProps} />
      <ExportPrivacyReviewDialog {...exportPrivacyReview.dialogProps} />
    </div>
  );
});
