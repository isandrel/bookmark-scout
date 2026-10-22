/**
 * Smart Rules in Options: the rules (`bookmark-rules.ts`) in the order they run, each turned on
 * or off, edited, duplicated, deleted, or dragged to another place, and new ones from scratch or
 * from a template. A rule changes nothing here: Smart Rules in the Tools sidebar runs them, with a
 * review first.
 */
import { ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** Each template's name, by its id in `[[templates]]` of config/rules/rules.toml. */
const TEMPLATE_NAME_KEYS: Record<BookmarkRuleTemplateId, MessageKey> = {
  github: 'rules_templateGithub',
  youtube: 'rules_templateYoutube',
  tutorial: 'rules_templateTutorial',
};

type Draft = {
  /** Undefined for a rule that is not saved yet. */
  id?: string;
  name: string;
  query: string;
  tags: string;
  folderId: string;
  enabled: boolean;
};

const EMPTY_DRAFT: Draft = { name: '', query: '', tags: '', folderId: '', enabled: true };

function draftOf(rule: BookmarkRule): Draft {
  return {
    id: rule.id,
    name: rule.name,
    query: rule.query,
    tags: rule.addTags.join(', '),
    folderId: rule.moveTo?.folderId ?? '',
    enabled: rule.enabled,
  };
}

/** The folder path a rule names, as the tree shows it now. */
function folderPathOf(tree: readonly BookmarkTreeNode[], folderId: string): string | undefined {
  const folder = indexWritableFolders(tree).get(folderId);
  return folder?.path.map((title) => getBookmarkDisplayTitle(title)).join(FOLDER_PATH_SEPARATOR);
}

/** A rule in one line: its search, then what it does. */
function describeRule(rule: BookmarkRule): string {
  const actions = [
    ...(rule.addTags.length > 0 ? [t('rules_summaryTags', formatList(rule.addTags))] : []),
    ...(rule.moveTo ? [t('rules_summaryMove', rule.moveTo.path)] : []),
  ];
  return t('rules_summary', [rule.query, actions.join(t('format_separator'))]);
}

function RuleEditorDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [value, setValue] = useState<Draft>(EMPTY_DRAFT);
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

  const tags = parseBookmarkTags(value.tags);
  const queryReadable = useMemo(() => {
    const { query, diagnostics } = parseSearchQuery(value.query);
    return query.terms.length > 0 && diagnostics.length === 0;
  }, [value.query]);
  // How many bookmarks the search finds now, as the run would, whatever the actions.
  const matches = useMemo(() => {
    if (!library || !queryReadable) return undefined;
    const probe: BookmarkRule = {
      id: 'probe',
      name: 'probe',
      enabled: true,
      query: value.query.trim(),
      syntaxVersion: SEARCH_SYNTAX_VERSION,
      addTags: [],
      moveTo: { folderId: '', path: '' },
    };
    return planBookmarkRules([probe], library.tree, library.metadata).length;
  }, [library, queryReadable, value.query]);

  const save = async () => {
    if (!draft) return;
    const path = value.folderId && library ? folderPathOf(library.tree, value.folderId) : undefined;
    const candidate = {
      id: draft.id ?? createBookmarkRuleId(),
      name: value.name,
      enabled: value.enabled,
      query: value.query,
      syntaxVersion: SEARCH_SYNTAX_VERSION,
      addTags: tags,
      ...(value.folderId ? { moveTo: { folderId: value.folderId, path: path ?? '' } } : {}),
    };
    const parsed = bookmarkRuleSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        !value.name.trim()
          ? t('rules_errorName')
          : !queryReadable
            ? t('rules_errorQuery')
            : tags.length === 0 && !value.folderId
              ? t('rules_errorAction')
              : t('rules_errorInvalid'),
      );
      return;
    }
    setSaving(true);
    try {
      await saveBookmarkRule(parsed.data);
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
  const [editing, setEditing] = useState<Draft | null>(null);

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
          <Button size="sm" onClick={() => setEditing(EMPTY_DRAFT)}>
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
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('rules_editRule', rule.name)}
                onClick={() => setEditing(draftOf(rule))}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('rules_duplicate', rule.name)}
                onClick={() =>
                  setEditing({
                    ...draftOf(rule),
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
      <RuleEditorDialog draft={editing} onClose={() => setEditing(null)} />
    </OptionsPanel>
  );
}
