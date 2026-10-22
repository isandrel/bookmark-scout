/**
 * Each tool's review: the dialog its results open in, by tool id. Tools without a review (the AI
 * context pack downloads a file) have no entry. Loaded the first time a tool runs (`ToolReview`).
 */
import { useState } from 'react';
import type { ToolReviewProps } from './ToolViews';

/** The results dialog every review but reorganization uses, titled after the tool. */
function ReviewDialog<Id extends ToolId>({
  tool,
  state,
  close,
  description,
  children,
}: Pick<ToolReviewProps<Id>, 'tool' | 'state' | 'close'> & {
  description: string;
  children: React.ReactNode;
}) {
  return (
    <ToolResultsDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t(tool.titleKey)}
      description={description}
    >
      {children}
    </ToolResultsDialog>
  );
}

function DeadLinksReview(props: ToolReviewProps<'deadLinks'>) {
  const [repair, setRepair] = useState<DeadLinkScanResult | null>(null);
  return (
    <>
      <ReviewDialog {...props} description={t('tools_deadLinksDialogDesc')}>
        <DeadLinkResultsView
          result={props.state.result}
          onReview={() => {
            setRepair(props.state.result);
            props.close();
          }}
        />
      </ReviewDialog>
      <DeadLinkRepairDialog
        result={repair}
        onClose={() => setRepair(null)}
        onChanged={props.environment.refresh}
      />
    </>
  );
}

function BookmarkRulesReview(props: ToolReviewProps<'bookmarkRules'>) {
  const { value: rules } = useStoredValue(bookmarkRulesValue);
  const ruleNames = new Map(rules.map((rule) => [rule.id, rule.name]));
  return (
    <ReviewDialog {...props} description={t('tools_bookmarkRulesDialogDesc')}>
      <RulesResultsView
        items={props.state.result ?? []}
        ruleNames={ruleNames}
        isApplying={props.state.phase === 'applying'}
        onApply={props.apply}
      />
    </ReviewDialog>
  );
}

const TOOL_REVIEWS: {
  [Id in ToolId]?: (props: ToolReviewProps<Id>) => React.ReactNode;
} = {
  autoTagging: (props) => (
    <ReviewDialog {...props} description={t('tools_autoTaggingDialogDesc')}>
      <AIMetadataResultsView
        items={props.state.result ?? []}
        saveLabel={(count) => tPlural('tools_aiMetadataSaveTags', count)}
        isSaving={props.state.phase === 'applying'}
        onSave={props.apply}
      />
    </ReviewDialog>
  ),
  summarizer: (props) => (
    <ReviewDialog {...props} description={t('tools_summarizerDialogDesc')}>
      <AIMetadataResultsView
        items={props.state.result ?? []}
        saveLabel={(count) => tPlural('tools_aiMetadataSaveSummaries', count)}
        isSaving={props.state.phase === 'applying'}
        onSave={props.apply}
      />
    </ReviewDialog>
  ),
  reorganization: ({ state, apply, undo, close, environment }) => (
    <ReorganizationDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      plan={state.result}
      isLoading={state.phase === 'scanning'}
      errors={state.errors}
      notice={state.notice}
      onUndo={undo}
      onApply={() => apply()}
      onCancel={close}
      bookmarksBarTitle={findBookmarksBarFolder(environment.folders)?.title}
    />
  ),
  duplicates: (props) => {
    const { result, phase, notice } = props.state;
    return (
      <ReviewDialog
        {...props}
        description={tPlural('tools_duplicatesDialogDesc', result?.groups.length ?? 0, [
          String(result?.scannedBookmarks ?? 0),
        ])}
      >
        <DuplicateResultsView
          result={result}
          isRemoving={phase === 'applying'}
          onClose={props.close}
          onConfirm={(groups) => props.apply(groups)}
          notice={notice?.message}
          onUndo={notice?.canUndo ? props.undo : undefined}
        />
      </ReviewDialog>
    );
  },
  urlCleaner: (props) => (
    <ReviewDialog
      {...props}
      description={tPlural('tools_urlCleanerDialogDesc', props.state.result?.previews.length ?? 0)}
    >
      <UrlCleanerResultsView
        result={props.state.result}
        isApplying={props.state.phase === 'applying'}
        onClose={props.close}
        onConfirm={(previews) => props.apply(previews)}
      />
    </ReviewDialog>
  ),
  deadLinks: (props) => <DeadLinksReview {...props} />,
  metadataFetcher: (props) => (
    <ReviewDialog {...props} description={t('tools_metadataDialogDesc')}>
      <MetadataResultsView
        result={props.state.result}
        isApplying={props.state.phase === 'applying'}
        onApply={props.apply}
      />
    </ReviewDialog>
  ),
  siteIcons: (props) => (
    <ReviewDialog {...props} description={t('tools_siteIconsDialogDesc')}>
      <SiteIconResultsView
        result={props.state.result}
        isSaving={props.state.phase === 'applying'}
        onSave={props.apply}
      />
    </ReviewDialog>
  ),
  privacyScanner: (props) => (
    <ReviewDialog {...props} description={t('tools_privacyDialogDesc')}>
      <PrivacyResultsView
        result={props.state.result}
        isApplying={props.state.phase === 'applying'}
        onDelete={props.apply}
      />
    </ReviewDialog>
  ),
  bookmarkRules: (props) => <BookmarkRulesReview {...props} />,
  pageText: (props) => (
    <ReviewDialog {...props} description={t('tools_pageTextDialogDesc')}>
      <PageTextResultsView
        result={props.state.result}
        isSaving={props.state.phase === 'applying'}
        onSave={props.apply}
      />
    </ReviewDialog>
  ),
  statistics: (props) => (
    <ReviewDialog {...props} description={t('tools_statisticsDialogDesc')}>
      <StatisticsResultsView result={props.state.result} />
    </ReviewDialog>
  ),
};

/** The review of `props.tool`, or nothing for a tool without one. */
export function ToolReviewView(props: ToolReviewProps<ToolId>) {
  const Review = TOOL_REVIEWS[props.tool.id] as
    | ((props: ToolReviewProps<ToolId>) => React.ReactNode)
    | undefined;
  return Review ? <Review {...props} /> : null;
}
