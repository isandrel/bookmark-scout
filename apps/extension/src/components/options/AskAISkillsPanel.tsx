/**
 * Options > AI > Skills: the skills Ask AI may read, built-in, the user's own, and those from
 * folders on this computer (`services/ask-ai-local-skills.ts`, while Skills From This Computer is
 * on), each on or off (`askAiDisabledSkills`), with an editor for a new or changed `SKILL.md`,
 * import from files or a folder, export, and delete. Reading and checking skills needs the skills SDK, so it loads from
 * `ask-ai-skills.lazy.ts` and `ask-ai-skill-files.lazy.ts` when this panel opens.
 */
import { useEffect, useRef, useState } from 'react';

type SkillOrigin = 'builtIn' | 'user' | 'local';

type ShownSkill = {
  name: string;
  description: string;
  origin: SkillOrigin;
  files: SkillFile[];
};

const ORIGIN_BADGES: Record<SkillOrigin, MessageKey> = {
  builtIn: 'askAI_skillBuiltIn',
  user: 'askAI_skillYours',
  local: 'askAI_skillThisComputer',
};

/** What reading the skills from this computer came to, in a line under the list. */
function localStatus(result: LocalSkillsResult): string | undefined {
  switch (result.state) {
    case 'off':
      return undefined;
    case 'ready':
      return [
        t('askAI_localSkillsFound', formatCount(result.skills.length)),
        ...(result.leftOut.length > 0
          ? [t('askAI_localSkillsLeftOut', formatCount(result.leftOut.length))]
          : []),
      ].join(' ');
    case 'notInstalled':
      return t('askAI_localSkillsNotInstalled', BRIDGE_INSTALL_COMMAND);
    case 'noAnswer':
    case 'outdated':
      return t('askAI_localSkillsOutdated');
    case 'failed':
      return t('askAI_localSkillsFailed');
  }
}

/** The command that registers the bridge program with this computer's browsers. */
const BRIDGE_INSTALL_COMMAND = 'bookmark-scout-mcp install';
const LOCAL_SOURCE_PREFIX = 'local:';

type Editor = { replacing?: string; text: string };

function limitMessage(error: SkillLimitError): string {
  switch (error) {
    case 'tooManySkills':
      return t('askAI_skillTooMany', formatCount(skillLibraryConfig.max_skills));
    case 'tooManyFiles':
      return t('askAI_skillTooManyFiles', formatCount(skillLibraryConfig.max_files));
    case 'tooLarge':
      return t('askAI_skillTooLarge', formatCount(skillLibraryConfig.max_skill_chars));
  }
}

/** Downloads a skill's files, each named after the skill so a folder of them stays apart. */
function exportSkill(skill: ShownSkill): void {
  for (const file of skill.files) {
    downloadExport(file.content, `${skill.name}-${file.path.replaceAll('/', '-')}`, MIME.markdown);
  }
}

export function AskAISkillsPanel() {
  const { value: userSkills } = useStoredValue(askAiSkillsValue);
  const { value: disabled, setValue: setDisabled } = useSetting('askAiDisabledSkills');
  const { value: localOn } = useSetting('askAiLocalSkills');
  const { value: localFolders } = useSetting('askAiLocalSkillFolders');
  const [local, setLocal] = useState<LocalSkillsResult>({ state: 'off' });
  const [refreshes, setRefreshes] = useState(0);
  const [shown, setShown] = useState<ShownSkill[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const off = new Set(disabled);

  // The skills from this computer, read again when their settings change or on Refresh.
  useEffect(() => {
    let current = true;
    void localSkillsFor(
      { askAiLocalSkills: localOn, askAiLocalSkillFolders: localFolders },
      refreshes > 0,
    ).then((result) => {
      if (current) setLocal(result);
    });
    return () => {
      current = false;
    };
  }, [localOn, localFolders, refreshes]);

  // The list with each skill's description, read by the skills SDK.
  useEffect(() => {
    let current = true;
    void import('@/services/ask-ai-skills.lazy').then(async (skills) => {
      const localFiles = localSkillFiles(local);
      const registry = await skills.createAskAISkills({ user: userSkills, local: localFiles });
      const builtIn = new Map(skills.builtInSkillFiles().map((skill) => [skill.name, skill.files]));
      const own = new Map(userSkills.map((skill) => [skill.name, skill.files]));
      const fromComputer = new Map(localFiles.map((skill) => [skill.name, skill.files]));
      const origins: Record<string, SkillOrigin> = {
        [skills.SKILL_LOCATIONS.builtIn]: 'builtIn',
        [skills.SKILL_LOCATIONS.user]: 'user',
        [skills.SKILL_LOCATIONS.local]: 'local',
      };
      if (!current) return;
      setShown(
        registry.list().map((descriptor) => {
          const origin = origins[descriptor.location ?? ''] ?? 'user';
          // A skill from this computer is found by its folder, which its source id names.
          const folder = descriptor.sourceId?.startsWith(LOCAL_SOURCE_PREFIX)
            ? descriptor.sourceId.slice(LOCAL_SOURCE_PREFIX.length)
            : '';
          return {
            name: descriptor.name,
            description: descriptor.description,
            origin,
            files:
              (origin === 'builtIn'
                ? builtIn.get(descriptor.name)
                : origin === 'local'
                  ? fromComputer.get(folder)
                  : own.get(descriptor.name)) ?? [],
          };
        }),
      );
    });
    return () => {
      current = false;
    };
  }, [userSkills, local]);
  const status = localStatus(local);

  const toggle = (name: string, on: boolean) => {
    const next = on ? disabled.filter((other) => other !== name) : [...disabled, name];
    void setDisabled(next).catch(notifySettingNotSaved);
  };

  /** Checks and saves a skill; errors stay in the editor (or a toast for an import). */
  const save = async (files: SkillFile[], replacing?: string): Promise<string[]> => {
    const { checkSkillFiles } = await import('@/services/ask-ai-skill-files.lazy');
    const checked = checkSkillFiles(files);
    if (!checked.ok) return [t('askAI_skillInvalid'), ...checked.errors];
    if (shown.some((skill) => skill.origin === 'builtIn' && skill.name === checked.name)) {
      return [t('askAI_skillNameTaken', checked.name)];
    }
    const refused = await saveUserSkill({ name: checked.name, files: checked.files }, replacing);
    return refused ? [limitMessage(refused)] : [];
  };

  const saveEditor = async () => {
    if (!editor) return;
    const problems = await save([{ path: SKILL_FILE, content: editor.text }], editor.replacing);
    setErrors(problems);
    if (problems.length === 0) setEditor(null);
  };

  const importPicked = async (input: HTMLInputElement | null) => {
    const picked = [...(input?.files ?? [])];
    if (input) input.value = '';
    if (picked.length === 0) return;
    const { skillFilesFromUpload } = await import('@/services/ask-ai-skill-files.lazy');
    const files = await skillFilesFromUpload(picked);
    const problems = await save(files);
    const [title, ...details] = problems;
    if (title) toast.error({ title, description: details.join('\n') || undefined });
    else toast.success({ title: t('askAI_skillImported') });
  };

  const editing = (skill: ShownSkill) =>
    setEditor({
      replacing: skill.name,
      text: skill.files.find((file) => file.path === SKILL_FILE)?.content ?? '',
    });

  return (
    <OptionsPanel
      id="ask-ai-skills"
      data-testid="ask-ai-skills"
      title={t('settings_askAiDisabledSkills')}
      description={t('settings_askAiDisabledSkillsDesc')}
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setErrors([]);
              setEditor({ text: t('askAI_skillTemplate') });
            }}
          >
            {t('askAI_skillNew')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => filesInput.current?.click()}
          >
            {t('askAI_skillImportFiles')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => folderInput.current?.click()}
          >
            {t('askAI_skillImportFolder')}
          </Button>
          <input
            ref={filesInput}
            type="file"
            multiple
            accept=".md,text/markdown,text/plain"
            className="hidden"
            data-testid="ask-ai-skill-files"
            onChange={(event) => void importPicked(event.currentTarget)}
          />
          <input
            ref={folderInput}
            type="file"
            // A folder picker in Chrome and Firefox; React has no prop for it.
            {...{ webkitdirectory: '' }}
            className="hidden"
            data-testid="ask-ai-skill-folder"
            onChange={(event) => void importPicked(event.currentTarget)}
          />
        </div>
      }
    >
      <ul className="divide-y rounded-md border">
        {shown.map((skill) => (
          <li key={skill.name} data-skill={skill.name} className="flex items-start gap-2 px-3 py-2">
            <Checkbox
              id={`ask-ai-skill-${skill.name}`}
              className="mt-0.5"
              checked={!off.has(skill.name)}
              onCheckedChange={(checked) => toggle(skill.name, checked === true)}
            />
            <label htmlFor={`ask-ai-skill-${skill.name}`} className="min-w-0 flex-1 space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate font-mono">{skill.name}</span>
                <Badge variant="secondary">{t(ORIGIN_BADGES[skill.origin])}</Badge>
              </span>
              <span className="block text-xs text-muted-foreground">{skill.description}</span>
            </label>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => exportSkill(skill)}>
                {t('action_export')}
              </Button>
              {skill.origin === 'user' && (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => editing(skill)}>
                    {t('table_edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleting(skill.name)}
                  >
                    {t('action_delete')}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {status && (
        <div className="flex flex-wrap items-center gap-2" data-testid="ask-ai-local-skills-status">
          <p role="status" data-state={local.state} className="text-sm text-muted-foreground">
            {status}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshes((count) => count + 1)}
          >
            {t('askAI_localSkillsRefresh')}
          </Button>
        </div>
      )}

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-dialog-tall max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('askAI_skillEditorTitle')}</DialogTitle>
            <DialogDescription>{t('askAI_skillEditorDesc')}</DialogDescription>
          </DialogHeader>
          <textarea
            aria-label={t('askAI_skillEditorTitle')}
            data-testid="ask-ai-skill-editor"
            value={editor?.text ?? ''}
            onChange={(event) => setEditor((open) => open && { ...open, text: event.target.value })}
            rows={16}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-sm text-destructive-text">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditor(null)}>
              {t('action_cancel')}
            </Button>
            <Button onClick={() => void saveEditor()}>{t('bookmarks_editSave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('askAI_skillDeleteConfirm', deleting ?? '')}
        confirmLabel={t('action_delete')}
        onConfirm={() => {
          if (deleting) {
            void deleteUserSkill(deleting);
            if (off.has(deleting)) toggle(deleting, true);
          }
          setDeleting(null);
        }}
      />
    </OptionsPanel>
  );
}
