/**
 * ToolsSidebar - Right sidebar panel for bookmark tools, matching the left folder sidebar.
 * Every tool comes from `TOOL_DEFINITIONS` and runs through `useToolRun`; the Data section
 * (export and import) follows the tool sections.
 */

import { Wrench } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

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
  /** Starts network work once access to `sites` (or all websites) is granted. */
  runWithAccess: (start: () => Promise<void>, sites: string[]) => void;
};

/** A job's results as its tool's review reads them. */
const JOB_REVIEW_RESULTS: { [Kind in JobKind]: (job: JobRecord, results: unknown[]) => unknown } = {
  deadLinks: (job, results) => ({ scannedBookmarks: job.total, items: results }),
};

/**
 * A tool that runs as a background job: the card starts it with the scope frozen now, shows the
 * newest job of its kind (also one started from another page), and opens the review on its saved
 * results. Closing the page or the review never stops the job.
 */
function JobToolEntry({
  tool,
  kind,
  environment,
  currentFolderName,
  runWithAccess,
}: ToolEntryProps & { kind: JobKind }) {
  const job = useLatestJob(kind);
  const [review, setReview] = useState<{ open: boolean; result: unknown } | null>(null);
  // The job this page started: its review opens once it finishes while the page is open, as a
  // scan did; closing the page first leaves the results for Review results.
  const [watching, setWatching] = useState<string | null>(null);
  const { settings } = environment;
  const Review = TOOL_REVIEWS[tool.id] as
    | ((props: ToolReviewProps<ToolId>) => React.ReactNode)
    | undefined;
  const Icon = tool.icon;
  const start = async (scope: BookmarkToolScope) => {
    const folderId = environment.currentFolderId;
    const response = await sendJobCommand({
      type: 'start',
      // A new id per click: each click is a new run.
      commandId: crypto.randomUUID(),
      kind,
      source: 'manager',
      scope: scope === 'folder' && folderId ? { mode: 'folder', folderId } : { mode: 'all' },
    }).catch(() => undefined);
    if (!response?.ok) toast.error({ title: t('jobs_commandFailed') });
    else setWatching(response.job?.id ?? null);
  };
  const openReview = async (shown: JobRecord) => {
    const results = await readJobResults(shown.id);
    setReview({ open: true, result: JOB_REVIEW_RESULTS[kind](shown, results) });
  };
  useEffect(() => {
    if (!job || job.id !== watching || isJobActive(job)) return;
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
          const nodes = getScopedNodes(environment.folders, environment.currentFolderId, scope);
          const urls = flattenBookmarks(nodes).flatMap(({ node }) => node.url ?? []);
          runWithAccess(() => start(scope), getUrlSites(urls));
        }}
        scopeCapability={getToolScopeCapability(tool.id)}
        defaultScope={getToolDefaultScope(settings, tool, environment.currentFolderId)}
        currentFolderName={currentFolderName}
        isLoading={job ? isJobActive(job) : false}
        footer={
          job ? (
            <JobStatus job={job} showTitle={false} onReview={() => void openReview(job)} />
          ) : null
        }
      />
      {Review && review ? (
        <Review
          tool={tool as ToolDefinitions[ToolId]}
          state={
            {
              phase: review.open ? 'review' : 'idle',
              open: review.open,
              result: review.result,
              errors: [],
              notice: null,
            } as ToolRunState<ToolResults[ToolId]>
          }
          apply={async () => undefined}
          undo={async () => undefined}
          close={() => setReview((current) => (current ? { ...current, open: false } : null))}
          environment={environment}
        />
      ) : null}
    </>
  );
}

/** One tool's card and review, driven by its table entry. */
function ToolEntry(props: ToolEntryProps) {
  return props.tool.job ? (
    <JobToolEntry {...props} kind={props.tool.job} />
  ) : (
    <ScanToolEntry {...props} />
  );
}

/** A tool that scans while its page is open. */
function ScanToolEntry({ tool, environment, currentFolderName, runWithAccess }: ToolEntryProps) {
  const { state, run, apply, undo, close } = useToolRun(tool, environment);
  const { settings } = environment;
  // Off while the setting is off or, in Firefox, while data sharing for AI is not allowed; on but
  // without a usable default service, it says to finish the setup instead of failing on click.
  const aiSetup = useAISetup(tool.aiFeature);
  const aiBlocked = Boolean(tool.aiFeature) && aiSetup !== 'ready';
  // With only the built-in model, which does not run tools, say what is missing.
  const { service: defaultService } = useAIFeatureService();
  const needsOtherService =
    defaultService !== undefined &&
    tool.aiFeature !== undefined &&
    !providerSupportsFeature(defaultService.provider, tool.aiFeature);
  const aiNotice =
    aiSetup !== 'needsSetup'
      ? t('ai_featuresDisabledNotice')
      : needsOtherService
        ? t('builtinAi_needsOtherService')
        : t('aiOnboard_setupNotice');
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
          if (tool.needsHostAccess) {
            // Access only to the sites this run requests: the same nodes the scan reads.
            const nodes = getScopedNodes(environment.folders, environment.currentFolderId, scope);
            const urls = flattenBookmarks(nodes).flatMap(({ node }) => node.url ?? []);
            runWithAccess(() => run(scope), getUrlSites(urls));
          } else void run(scope);
        }}
        disabled={aiBlocked}
        notice={aiBlocked && aiSetup !== 'loading' ? aiNotice : undefined}
        scopeCapability={getToolScopeCapability(tool.id)}
        defaultScope={getToolDefaultScope(settings, tool, environment.currentFolderId)}
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
          environment={environment}
        />
      ) : null}
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
                      runWithAccess={(start, sites) => void hostAccess.run(start, sites)}
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

      <PermissionDialog {...hostAccess.dialogProps} />
      <ExportPrivacyReviewDialog {...exportPrivacyReview.dialogProps} />
    </div>
  );
});
