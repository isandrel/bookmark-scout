/**
 * The prompt library in Options: per AI task, pick the built-in default or one of any number of
 * saved custom prompts, and create, edit, duplicate, or delete them. Custom prompts sync across
 * devices; the app's own output rules are added after them, so a prompt cannot break parsing.
 */

import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
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
  const bytes = promptByteLength(system);
  const unknown = editor ? findUnknownPromptVariables(editor.task, system) : [];
  const preview = useMemo(
    () =>
      editor ? interpolatePrompt(system, getPromptPreviewVariables(editor.task, settings)) : '',
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
    const invalid = validateCustomPrompt(name, system);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCustomPrompt({ id: editor.id, task: editor.task, name, system });
      // A new prompt is what the user wants to use, so it becomes the task's prompt.
      if (!editor.id) await setActivePrompt(editor.task, saved.id);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('error_unknown'));
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
            {task ? ` · ${t(task.nameKey)}` : ''}
          </DialogTitle>
          <DialogDescription>{t('prompt_editorDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prompt-name" className="text-sm font-medium">
              {t('prompt_name')}
            </Label>
            <Input
              id="prompt-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prompt-text" className="text-sm font-medium">
              {t('prompt_text')}
            </Label>
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
              id="prompt-text"
              ref={textRef}
              value={system}
              onChange={(event) => setSystem(event.target.value)}
              rows={14}
              spellCheck={false}
              aria-describedby="prompt-text-size"
              className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span id="prompt-text-size" className={bytes > MAX_PROMPT_BYTES ? 'text-destructive-text' : ''}>
                {t('prompt_size', [
                  (bytes / 1000).toFixed(1),
                  (MAX_PROMPT_BYTES / 1000).toFixed(0),
                ])}
              </span>
              {unknown.length > 0 && (
                <span className="text-warning">
                  {t('prompt_unknownVariables', unknown.map((v) => `{{${v}}}`).join(', '))}
                </span>
              )}
            </div>
          </div>
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

function PromptTaskRow({
  taskId,
  library,
  onEdit,
  onDelete,
}: {
  taskId: PromptTaskId;
  library: PromptLibrary;
  onEdit: (editor: EditorState) => void;
  onDelete: (prompt: CustomPrompt) => void;
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
                onClick={() => onEdit({ task: taskId, id: active.id, name: active.name, system: active.system })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('prompt_duplicateNamed', active.name)}
                title={t('prompt_duplicateNamed', active.name)}
                onClick={() =>
                  startFrom({ name: t('options_aiServiceCopyName', active.name), system: active.system })
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => startFrom({ name: t('prompt_newName', t(task.nameKey)), system: task.system })}
            >
              <Plus className="h-4 w-4" />
              {t('prompt_customize')}
            </Button>
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

  return (
    <section
      aria-labelledby="prompt-library-heading"
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="prompt-library"
    >
      <div>
        <h3 id="prompt-library-heading" className="text-base font-medium">
          {t('prompt_libraryTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('prompt_libraryDescription')}</p>
      </div>
      <ul className="divide-y overflow-hidden rounded-md border">
        {PROMPT_TASK_IDS.map((taskId) => (
          <PromptTaskRow
            key={taskId}
            taskId={taskId}
            library={library}
            onEdit={setEditor}
            onDelete={setDeleting}
          />
        ))}
      </ul>
      <PromptEditorDialog editor={editor} onClose={() => setEditor(null)} />
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('prompt_deleteTitle', deleting?.name ?? '')}</DialogTitle>
            <DialogDescription>{t('prompt_deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t('action_cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) void deleteCustomPrompt(deleting.id);
                setDeleting(null);
              }}
            >
              {t('options_aiServiceDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
