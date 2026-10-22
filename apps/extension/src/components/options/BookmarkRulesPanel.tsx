/**
 * Smart Rules in Options: the rules (`bookmark-rules.ts`) in the order they run, each turned on
 * or off, edited, duplicated, deleted, or dragged to another place, and new ones from scratch or
 * from a template. A rule changes nothing here: Smart Rules in the Tools sidebar runs them, with a
 * review first, and Tag New Bookmarks and Move New Bookmarks apply them to new bookmarks. A rule
 * that moves new bookmarks automatically says so in the list, and says when it cannot (its folder
 * changed), so an automatic move is never a surprise.
 */
import { ChevronDown, Copy, FolderInput, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** Each template's name, by its id in `[[templates]]` of config/rules/rules.toml. */
const TEMPLATE_NAME_KEYS: Record<BookmarkRuleTemplateId, MessageKey> = {
  github: 'rules_templateGithub',
  youtube: 'rules_templateYoutube',
  tutorial: 'rules_templateTutorial',
};

const RULE_DRAFT_ERROR_KEYS = {
  name: 'rules_errorName',
  query: 'rules_errorQuery',
  action: 'rules_errorAction',
  invalid: 'rules_errorInvalid',
} as const satisfies Record<RuleDraftError, MessageKey>;

function RuleEditorDialog({ draft, onClose }: { draft: RuleDraft | null; onClose: () => void }) {
  const [value, setValue] = useState<RuleDraft>(EMPTY_RULE_DRAFT);
  const [library, setLibrary] = useState<{
    tree: BookmarkTreeNode[];
    metadata: StoredBookmarkMetadataById;
  }>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setValue(draft);
    setError(undefined);
    Promise.all([fetchBookmarkTree(), bookmarkMetadataValue.get()])
      .then(([tree, metadata]) => setLibrary({ tree, metadata }))
      .catch(() => setLibrary(undefined));
  }, [draft]);

  const queryReadable = useMemo(() => isRuleQueryReadable(value.query), [value.query]);
  // What is wrong with the search, as the search boxes say it: a rule never runs on part of one.
  const queryProblem = useMemo(() => {
    const [diagnostic] = parseSearchQuery(value.query).diagnostics;
    return diagnostic ? describeSearchDiagnostic(diagnostic) : undefined;
  }, [value.query]);
  const matches = useMemo(
    () =>
      library && queryReadable
        ? countRuleMatches(value.query, library.tree, library.metadata)
        : undefined,
    [library, queryReadable, value.query],
  );

  const save = async () => {
    if (!draft) return;
    const result = ruleFromDraft(value, draft.id ?? createBookmarkRuleId(), library?.tree);
    if ('error' in result) {
      setError(t(RULE_DRAFT_ERROR_KEYS[result.error]));
      return;
    }
    setSaving(true);
    try {
      await saveBookmarkRule(result.rule);
      onClose();
    } catch {
      setError(t('rules_errorSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
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
                placeholder="domain:github.com"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field id="rule-tags" label={t('rules_addTags')} description={t('rules_addTagsHelp')}>
            {(control) => (
              <Input
                {...control}
                value={value.tags}
                onChange={(event) => setValue({ ...value, tags: event.target.value })}
                autoComplete="off"
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="rule-enabled"
              checked={value.enabled}
              onCheckedChange={(checked) => setValue({ ...value, enabled: checked === true })}
            />
            <label htmlFor="rule-enabled" className="text-sm font-medium">
              {t('rules_enabled')}
            </label>
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
          <Button onClick={() => void save()} disabled={saving}>
            {t('rules_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BookmarkRulesPanel() {
  const { value: rules } = useStoredValue(bookmarkRulesValue);
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

  const addTemplate = (template: (typeof BOOKMARK_RULE_TEMPLATES)[number]) =>
    void saveBookmarkRule({
      id: createBookmarkRuleId(),
      name: t(TEMPLATE_NAME_KEYS[template.id]),
      // Templates start turned off: a rule acts only once the user chose it.
      enabled: false,
      query: template.query,
      syntaxVersion: SEARCH_SYNTAX_VERSION,
      addTags: [...template.add_tags],
    });

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
          <Button size="sm" onClick={() => setEditing(EMPTY_RULE_DRAFT)}>
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
                <DropdownMenuItem key={template.id} onClick={() => addTemplate(template)}>
                  {t(TEMPLATE_NAME_KEYS[template.id])}
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
                  setEditing({
                    ...ruleDraftOf(rule),
                    id: undefined,
                    name: t('rules_copyName', rule.name),
                  })
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
      <RuleAutoLogList />
      <RuleEditorDialog draft={editing} onClose={() => setEditing(null)} />
    </OptionsPanel>
  );
}
