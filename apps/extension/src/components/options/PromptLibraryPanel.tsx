/**
 * The prompt library in Options: per AI task, pick the built-in default or one of any number of
 * saved custom prompts, and create, edit, duplicate, or delete them. Custom prompts sync across
 * devices; the app's own output rules are added after them, so a prompt cannot break parsing.
 */

import { Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_VALUE = 'default';

type EditorState = {
  task: PromptTaskId;
  /** Undefined for a prompt that is not saved yet. */
  id?: string;
  name: string;
  system: string;
};

function PromptEditorDialog({
  editor,
  onClose,
}: {
  editor: EditorState | null;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const [name, setName] = useState('');
  const [system, setSystem] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Load the editor's values each time it opens for a prompt.
  useEffect(() => {
    if (!editor) return;
    setName(editor.name);
    setSystem(editor.system);
    setError(undefined);
  }, [editor]);

  const task = editor ? PROMPT_TASKS[editor.task] : undefined;
  // Measured as sync storage stores the prompt, so the counter and the limit check agree with it.
  const bytes = editor ? customPromptBytes({ id: editor.id, task: editor.task, name, system }) : 0;
  const unknown = editor ? findUnknownPromptVariables(editor.task, system) : [];
  const preview = useMemo(
    () =>
      editor ? interpolatePrompt(system, getPromptVariables(editor.task, settings)) : '',
    [editor, system, settings],
  );

  const insertVariable = (variable: string) => {
    const field = textRef.current;
    const token = `{{${variable}}}`;
    if (!field) {
      setSystem((current) => current + token);
      return;
    }
    const start = field.selectionStart ?? system.length;
    const end = field.selectionEnd ?? system.length;
    const next = system.slice(0, start) + token + system.slice(end);
    setSystem(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!editor) return;
    const draft = { id: editor.id, task: editor.task, name, system };
    const invalid = validateCustomPrompt(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCustomPrompt(draft);
      // A new prompt is what the user wants to use, so it becomes the task's prompt.
      if (!editor.id) await setActivePrompt(editor.task, saved.id);
      onClose();
    } catch (saveError) {
      // Browser storage errors are English and technical, such as a sync quota name.
      setError(
        saveError instanceof PromptValidationError
          ? saveError.message
          : t('prompt_errorSaveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editor?.id ? t('prompt_editTitle') : t('prompt_newTitle')}
            {task ? ` ${t('format_separator')} ${t(task.nameKey)}` : ''}
          </DialogTitle>
          <DialogDescription>{t('prompt_editorDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="prompt-name" label={t('prompt_name')}>
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
          <Field id="prompt-text" label={t('prompt_text')}>
            {(control) => (
              <>
                {task && task.variables.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{t('prompt_variables')}</span>
                    {task.variables.map((variable) => (
                      <button
                        key={variable.name}
                        type="button"
                        onClick={() => insertVariable(variable.name)}
                        title={t(variable.descriptionKey)}
                        className="rounded-full border bg-card px-2 py-0.5 font-mono text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {`{{${variable.name}}}`}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  {...control}
                  ref={textRef}
                  value={system}
                  onChange={(event) => setSystem(event.target.value)}
                  rows={14}
                  spellCheck={false}
                  aria-describedby="prompt-text-size"
                  className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span
                    id="prompt-text-size"
                    className={bytes > MAX_PROMPT_BYTES ? 'text-destructive-text' : ''}
                  >
                    {t('prompt_size', [formatKilobytes(bytes), formatKilobytes(MAX_PROMPT_BYTES)])}
                  </span>
                  {unknown.length > 0 && (
                    <span className="text-warning">
                      {t('prompt_unknownVariables', unknown.map((v) => `{{${v}}}`).join(', '))}
                    </span>
                  )}
                </div>
              </>
            )}
          </Field>
          <details className="rounded-md border bg-muted/40 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">{t('prompt_preview')}</summary>
            <p className="mt-1 text-xs text-muted-foreground">{t('prompt_previewDescription')}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
              {preview}
            </pre>
          </details>
          {error && (
            <p role="alert" className="text-sm text-destructive-text">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('action_cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {t('prompt_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Read-only view of a task's built-in prompt, with its variables filled in from the settings. */
function BuiltInPromptDialog({
  taskId,
  onClose,
  onCustomize,
}: {
  taskId: PromptTaskId | null;
  onClose: () => void;
  onCustomize: (taskId: PromptTaskId) => void;
}) {
  const { settings } = useSettings();
  const task = taskId ? PROMPT_TASKS[taskId] : undefined;
  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('prompt_builtInTitle')}
            {task ? ` ${t('format_separator')} ${t(task.nameKey)}` : ''}
          </DialogTitle>
          <DialogDescription>{t('prompt_builtInDescription')}</DialogDescription>
        </DialogHeader>
        {task && taskId && (
          <div className="space-y-3">
            <pre
              data-testid="built-in-prompt"
              className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {task.system}
            </pre>
            {task.variables.length > 0 && (
              <details className="rounded-md border bg-muted/40 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">
                  {t('prompt_preview')}
                </summary>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('prompt_previewDescription')}
                </p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
                  {interpolatePrompt(task.system, getPromptVariables(taskId, settings))}
                </pre>
              </details>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('action_close')}
          </Button>
          {taskId && (
            <Button onClick={() => onCustomize(taskId)}>
              <Plus className="h-4 w-4" />
              {t('prompt_customize')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromptTaskRow({
  taskId,
  library,
  onEdit,
  onDelete,
  onView,
}: {
  taskId: PromptTaskId;
  library: PromptLibrary;
  onEdit: (editor: EditorState) => void;
  onDelete: (prompt: CustomPrompt) => void;
  onView: (taskId: PromptTaskId) => void;
}) {
  const task = PROMPT_TASKS[taskId];
  const prompts = library.prompts.filter((prompt) => prompt.task === taskId);
  const activeId = library.active[taskId];
  const active = prompts.find((prompt) => prompt.id === activeId);
  const selectId = `prompt-task-${taskId}`;
  const options = [
    { value: DEFAULT_VALUE, label: t('prompt_default') },
    ...prompts.map((prompt) => ({ value: prompt.id, label: prompt.name })),
  ];

  const startFrom = (source: { name: string; system: string }) =>
    onEdit({ task: taskId, name: source.name, system: source.system });

  return (
    <li className="space-y-2 px-4 py-3" data-testid="prompt-task" data-task={taskId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={`${selectId}-label`} className="text-sm font-medium">
            {t(task.nameKey)}
          </p>
          <p className="text-xs text-muted-foreground">{t(task.descriptionKey)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={activeId && active ? activeId : DEFAULT_VALUE}
            onValueChange={(value) =>
              void setActivePrompt(taskId, value === DEFAULT_VALUE ? undefined : String(value))
            }
            items={options}
          >
            <SelectTrigger aria-labelledby={`${selectId}-label`} className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {active ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('prompt_editNamed', active.name)}
                title={t('prompt_editNamed', active.name)}
                onClick={() =>
                  onEdit({ task: taskId, id: active.id, name: active.name, system: active.system })
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('prompt_duplicateNamed', active.name)}
                title={t('prompt_duplicateNamed', active.name)}
                onClick={() =>
                  startFrom({ name: t('format_copyName', active.name), system: active.system })
                }
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive-text hover:bg-destructive-wash hover:text-destructive-text"
                aria-label={t('prompt_deleteNamed', active.name)}
                title={t('prompt_deleteNamed', active.name)}
                onClick={() => onDelete(active)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('prompt_viewBuiltIn', t(task.nameKey))}
                title={t('prompt_viewBuiltIn', t(task.nameKey))}
                onClick={() => onView(taskId)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  startFrom({ name: t('prompt_newName', t(task.nameKey)), system: task.system })
                }
              >
                <Plus className="h-4 w-4" />
                {t('prompt_customize')}
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function PromptLibraryPanel() {
  const { library } = usePromptLibrary();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<CustomPrompt | null>(null);
  const [viewing, setViewing] = useState<PromptTaskId | null>(null);

  return (
    <OptionsPanel
      id="prompt-library"
      data-testid="prompt-library"
      title={t('prompt_libraryTitle')}
      description={t('prompt_libraryDescription')}
    >
      <ul className="divide-y overflow-hidden rounded-md border">
        {PROMPT_TASK_IDS.map((taskId) => (
          <PromptTaskRow
            key={taskId}
            taskId={taskId}
            library={library}
            onEdit={setEditor}
            onDelete={setDeleting}
            onView={setViewing}
          />
        ))}
      </ul>
      <PromptEditorDialog editor={editor} onClose={() => setEditor(null)} />
      <BuiltInPromptDialog
        taskId={viewing}
        onClose={() => setViewing(null)}
        onCustomize={(taskId) => {
          const task = PROMPT_TASKS[taskId];
          setViewing(null);
          setEditor({
            task: taskId,
            name: t('prompt_newName', t(task.nameKey)),
            system: task.system,
          });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('prompt_deleteTitle', deleting?.name ?? '')}
        description={t('prompt_deleteDescription')}
        confirmLabel={t('action_delete')}
        onConfirm={() => {
          if (deleting) void deleteCustomPrompt(deleting.id);
        }}
      />
    </OptionsPanel>
  );
}
