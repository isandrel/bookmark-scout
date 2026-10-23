/**
 * Smart Rules in Options: the rules (`bookmark-rules.ts`) in the order they run, each turned on
 * or off, edited, duplicated, deleted, or dragged to another place, and new ones from scratch or
 * from a template. A rule changes nothing here: Smart Rules in the Tools sidebar runs them, with a
 * review first, and Tag New Bookmarks and Move New Bookmarks apply them to new bookmarks. A rule
 * that moves new bookmarks automatically says so in the list, and says when it cannot (its folder
 * changed), so an automatic move is never a surprise. Each rule shows how its last reviewed run
 * went, and the editor tests a sample address or title against the search on this device.
 */
import {
  Check,
  ChevronDown,
  Copy,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** Each template's name, by its id in `[[templates]]` of config/rules/rules.toml. */
const TEMPLATE_NAME_KEYS: Record<BookmarkRuleTemplateId, MessageKey> = {
  github: 'rules_templateGithub',
  youtube: 'rules_templateYoutube',
  tutorial: 'rules_templateTutorial',
  reading: 'rules_templateReading',
};

/** A template's name, with the tags it adds (`$1`) from config, so no message types a tag. */
const templateName = (template: (typeof BOOKMARK_RULE_TEMPLATES)[number]) =>
  t(TEMPLATE_NAME_KEYS[template.id], formatList(template.add_tags));

const RULE_DRAFT_ERROR_KEYS = {
  name: 'rules_errorName',
  query: 'rules_errorQuery',
  pageText: 'rules_errorPageText',
  action: 'rules_errorAction',
  invalid: 'rules_errorInvalid',
} as const satisfies Record<RuleDraftError, MessageKey>;

/** Why no rule can be added: the list holds `max_rules` already. */
function ruleLimitMessage(): string {
  return t('rules_errorLimit', formatCount(MAX_BOOKMARK_RULES));
}

function RuleEditorDialog({ draft, onClose }: { draft: RuleDraft | null; onClose: () => void }) {
  const [value, setValue] = useState<RuleDraft>(EMPTY_RULE_DRAFT);
  const [tagDraft, setTagDraft] = useState('');
  const [library, setLibrary] = useState<{
    tree: BookmarkTreeNode[];
    metadata: StoredBookmarkMetadataById;
  }>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('');

  useEffect(() => {
    if (!draft) return;
    setValue(draft);
    setTagDraft('');
    setError(undefined);
    setSample('');
    Promise.all([fetchBookmarkTree(), bookmarkMetadataValue.get()])
      .then(([tree, metadata]) => setLibrary({ tree, metadata }))
      .catch(() => setLibrary(undefined));
  }, [draft]);

  // A tag still being typed counts, as if Enter had been pressed, so Save never drops it.
  const typed: RuleDraft = {
    ...value,
    tags: addTokens(parseBookmarkTags(value.tags), parseBookmarkTags(tagDraft), {
      keyOf: tagKey,
    }).join(', '),
  };
  const queryReadable = useMemo(() => isRunnableRuleQuery(value.query), [value.query]);
  // A rule with nothing to do cannot be turned on: a template that moves waits for its folder.
  const actionable = hasRuleAction(typed);
  // What is wrong with the search, as the search boxes say it: a rule never runs on part of one,
  // nor on page text, which rules do not see.
  const queryProblem = useMemo(() => {
    const [diagnostic] = parseSearchQuery(value.query).diagnostics;
    if (diagnostic) return describeSearchDiagnostic(diagnostic);
    return ruleQueryUsesPageText(value.query) ? t('rules_errorPageText') : undefined;
  }, [value.query]);
  const sampleMatches = useMemo(
    () => ruleMatchesSample(value.query, sample),
    [value.query, sample],
  );
  const matches = useMemo(
    () =>
      library && queryReadable
        ? countRuleMatches(value.query, library.tree, library.metadata)
        : undefined,
    [library, queryReadable, value.query],
  );

  const save = async () => {
    if (!draft) return;
    const result = ruleFromDraft(typed, draft.id ?? createBookmarkRuleId(), library?.tree);
    if ('error' in result) {
      setError(t(RULE_DRAFT_ERROR_KEYS[result.error]));
      return;
    }
    setSaving(true);
    try {
      await saveBookmarkRule(result.rule);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof BookmarkRuleLimitError
          ? ruleLimitMessage()
          : t('rules_errorSaveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-dialog-tall max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft?.id ? t('rules_editTitle') : t('rules_newTitle')}</DialogTitle>
          <DialogDescription>{t('rules_editorDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="rule-name" label={t('rules_name')}>
            {(control) => (
              <Input
                {...control}
                value={value.name}
                onChange={(event) => setValue({ ...value, name: event.target.value })}
                autoComplete="off"
              />
            )}
          </Field>
          <Field
            id="rule-query"
            label={t('rules_query')}
            description={
              matches === undefined ? t('rules_queryHelp') : tPlural('rules_matchCount', matches)
            }
            error={queryProblem}
          >
            {(control) => (
              <Input
                {...control}
                value={value.query}
                onChange={(event) => setValue({ ...value, query: event.target.value })}
                placeholder={BOOKMARK_RULE_EDITOR_EXAMPLES.query_placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <div className="space-y-1">
            <Field id="rule-sample" label={t('rules_testSample')}>
              {(control) => (
                <Input
                  {...control}
                  aria-describedby="rule-sample-result"
                  value={sample}
                  onChange={(event) => setSample(event.target.value)}
                  placeholder={BOOKMARK_RULE_EDITOR_EXAMPLES.sample_placeholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Field>
            <p
              id="rule-sample-result"
              role="status"
              data-testid="rule-sample-result"
              data-match={sampleMatches === undefined ? undefined : String(sampleMatches)}
              className={cn(
                'flex items-center gap-1 text-xs',
                sampleMatches ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {sampleMatches === undefined ? null : sampleMatches ? (
                <Check className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <X className="size-3.5 shrink-0" aria-hidden />
              )}
              {sampleMatches === undefined
                ? t('rules_testSampleHelp')
                : sampleMatches
                  ? t('rules_testMatches')
                  : t('rules_testNoMatch')}
            </p>
          </div>
          <Field id="rule-tags" label={t('rules_addTags')} description={t('rules_addTagsHelp')}>
            {(control) => (
              <TokenInput
                id={control.id}
                labelledBy={control['aria-labelledby']}
                describedBy={control['aria-describedby']}
                value={parseBookmarkTags(value.tags)}
                onChange={(tags) => setValue({ ...value, tags: tags.join(', ') })}
                parse={parseBookmarkTags}
                separator={TAG_SEPARATOR_PATTERN}
                keyOf={tagKey}
                maxItems={BOOKMARK_RULE_LIMITS.max_tags}
                maxLength={BOOKMARK_RULE_LIMITS.tag_max_length}
                draft={tagDraft}
                onDraftChange={setTagDraft}
              />
            )}
          </Field>
          <Field id="rule-folder" label={t('rules_moveTo')} description={t('rules_moveToHelp')}>
            {(control) => (
              <FolderSettingSelect
                {...control}
                value={value.folderId}
                onChange={(folderId) => setValue({ ...value, folderId })}
              />
            )}
          </Field>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="rule-auto-move"
                checked={value.autoMove && value.folderId !== ''}
                disabled={value.folderId === ''}
                aria-describedby="rule-auto-move-help"
                onCheckedChange={(checked) => setValue({ ...value, autoMove: checked === true })}
              />
              <label htmlFor="rule-auto-move" className="text-sm font-medium">
                {t('rules_autoMove')}
              </label>
            </div>
            <p id="rule-auto-move-help" className="text-xs text-muted-foreground">
              {t('rules_autoMoveHelp')}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="rule-enabled"
                checked={value.enabled && actionable}
                disabled={!actionable}
                aria-describedby={actionable ? undefined : 'rule-enabled-help'}
                onCheckedChange={(checked) => setValue({ ...value, enabled: checked === true })}
              />
              <label htmlFor="rule-enabled" className="text-sm font-medium">
                {t('rules_enabled')}
              </label>
            </div>
            {actionable ? null : (
              <p id="rule-enabled-help" className="text-xs text-muted-foreground">
                {t('rules_errorAction')}
              </p>
            )}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('action_cancel')}
          </Button>
          <Button data-testid="rule-save" onClick={() => void save()} disabled={saving}>
            {t('rules_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** How a rule's last reviewed run went: when, and what it tagged, moved, and left out. */
function RuleLastRun({ status }: { status: RuleRunStatus | undefined }) {
  if (!status) return null;
  const text = t('rules_lastRun', [
    formatDateTime(status.at),
    formatCount(status.tagged),
    formatCount(status.moved),
    formatCount(status.skipped),
  ]);
  return (
    <p data-testid="rule-last-run" className="truncate text-xs text-muted-foreground" title={text}>
      {text}
    </p>
  );
}

export function BookmarkRulesPanel() {
  const { value: rules } = useStoredValue(bookmarkRulesValue);
  const { value: runStatus } = useStoredValue(ruleRunStatusValue);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [tree, setTree] = useState<BookmarkTreeNode[]>();
  const loadTree = useCallback(() => {
    fetchBookmarkTree()
      .then(setTree)
      .catch(() => setTree(undefined));
  }, []);
  useEffect(loadTree, [loadTree]);
  useBookmarkEvents(loadTree);
  // Why each automatically moving rule cannot move now; unknown until the tree is read.
  const autoMoveBlocks = useMemo(
    () => (tree ? ruleAutoMoveBlocks(rules, tree) : undefined),
    [rules, tree],
  );

  /**
   * Opens a new rule unless the list is full: saving it would fail, so the user learns before
   * filling in the editor. Saving checks again, for a rule added in another tab meanwhile.
   */
  const startNewRule = (open: () => void) => {
    if (rules.length >= MAX_BOOKMARK_RULES) {
      toast.error({ title: ruleLimitMessage() });
      return;
    }
    open();
  };

  const addTemplate = (template: (typeof BOOKMARK_RULE_TEMPLATES)[number]) => {
    const name = templateName(template);
    // A template that moves has no folder yet: the editor opens on it to ask for one.
    if (template.move) {
      setEditing(ruleDraftOfTemplate(template, name));
      return;
    }
    saveBookmarkRule({
      id: createBookmarkRuleId(),
      name,
      // Templates start turned off: a rule acts only once the user chose it.
      enabled: false,
      query: template.query,
      syntaxVersion: SEARCH_SYNTAX_VERSION,
      addTags: [...template.add_tags],
    }).catch((saveError: unknown) => {
      toast.error({
        title:
          saveError instanceof BookmarkRuleLimitError
            ? ruleLimitMessage()
            : t('rules_errorSaveFailed'),
      });
    });
  };

  const remove = async (rule: BookmarkRule) => {
    const index = rules.findIndex((entry) => entry.id === rule.id);
    await deleteBookmarkRule(rule.id);
    toast.withUndo({
      title: t('rules_deleted', rule.name),
      onUndo: async () => {
        await restoreBookmarkRule(rule, index);
      },
    });
  };

  return (
    <OptionsPanel
      id="bookmark-rules"
      data-testid="bookmark-rules"
      title={t('rules_title')}
      description={t('rules_description')}
      actionsLayout="wrap"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            data-testid="rule-add"
            onClick={() => startNewRule(() => setEditing(EMPTY_RULE_DRAFT))}
          >
            <Plus />
            {t('rules_add')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
              {t('rules_fromTemplate')}
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {BOOKMARK_RULE_TEMPLATES.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => startNewRule(() => addTemplate(template))}
                >
                  {templateName(template)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('rules_empty')}</p>
      ) : (
        <SortableList
          items={rules}
          getId={(rule) => rule.id}
          getLabel={(rule) => rule.name}
          onReorder={(ids) => void reorderBookmarkRules(ids)}
          label={t('rules_title')}
          className="divide-y rounded-md border"
          itemProps={() => ({ 'data-testid': 'bookmark-rule' })}
          renderItem={(rule, handle) => (
            <div className="flex items-center gap-3 px-3 py-2">
              {handle}
              <Checkbox
                checked={rule.enabled}
                aria-label={t('rules_turnOn', rule.name)}
                onCheckedChange={(checked) =>
                  void setBookmarkRuleEnabled(rule.id, checked === true)
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rule.name}</p>
                <p className="truncate text-xs text-muted-foreground">{describeRule(rule)}</p>
                <RuleLastRun status={runStatus.rules[rule.id]} />
                {rule.autoMove ? (
                  autoMoveBlocks?.get(rule.id) ? (
                    <p
                      data-testid="rule-auto-move-paused"
                      className="flex items-center gap-1 text-xs text-warning"
                    >
                      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                      {t('rules_autoMovePaused')}
                    </p>
                  ) : (
                    <p
                      data-testid="rule-auto-move"
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <FolderInput className="size-3.5 shrink-0" aria-hidden />
                      {t('rules_autoMoveOn')}
                    </p>
                  )
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('rules_editRule', rule.name)}
                onClick={() => setEditing(ruleDraftOf(rule))}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('rules_duplicate', rule.name)}
                onClick={() =>
                  startNewRule(() =>
                    setEditing({
                      ...ruleDraftOf(rule),
                      id: undefined,
                      name: t('rules_copyName', rule.name),
                    }),
                  )
                }
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('rules_delete', rule.name)}
                onClick={() => void remove(rule)}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        />
      )}
      <RuleConflictList conflicts={runStatus.conflicts} />
      <RuleAutoLogList />
      <RuleEditorDialog draft={editing} onClose={() => setEditing(null)} />
    </OptionsPanel>
  );
}
