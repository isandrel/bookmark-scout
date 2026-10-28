/**
 * The two dialogs of Back up settings and Restore settings (`services/backup.ts`), loaded the first
 * time one opens (`useBackupFlow`), so Settings starts without them.
 *
 * - `BackupExportDialog`: a checklist of the backup's parts, each with what it holds, how many
 *   items, and about how large it is; Select all and Select none; the AI service keys apart, with a
 *   warning to confirm; password protection for the whole file or only the keys; the file name.
 * - `BackupImportDialog`: what the file holds, a password to unlock its protected parts, and per
 *   part what importing it would do here (a dry run: nothing changes), Merge or Replace, and each
 *   conflict; then the import, its result, and Undo import.
 */
import { AlertTriangle, KeyRound, Lock } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import type {
  BackupNote,
  BuiltBackup,
  ConflictChoice,
  ImportOutcome,
  ImportStrategy,
  OpenedBackup,
  OpenedPart,
  PartChoice,
  PartEstimate,
  PartReview,
} from '@/services/backup';
import { formatBackupFilename } from '@/services/backup-file.lazy';

/** A size in a part's line: kilobytes under a megabyte, where "0 MB" would read as nothing. */
const formatSize = (bytes: number) =>
  bytes < BYTES_PER_MB ? formatKilobytes(bytes) : formatMegabytes(bytes);

const noteText = (note: BackupNote) => t(note.key, note.values);

function WarningNotice({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      role="note"
      data-testid={testId}
      className="flex gap-2 rounded-lg border border-warning/40 bg-warning-wash p-3 text-sm text-warning"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1 text-foreground">{children}</div>
    </div>
  );
}

/** A checkbox with its label and the lines under it, which screen readers read as its description. */
function CheckRow({
  checked,
  onCheckedChange,
  label,
  children,
  disabled,
  badges,
  testId,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  badges?: ReactNode;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex gap-3" data-testid={testId}>
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        aria-describedby={children ? `${id}-details` : undefined}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          {badges}
        </div>
        {children ? (
          <div id={`${id}-details`} className="space-y-0.5 text-xs text-muted-foreground">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PartBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
      {children}
    </span>
  );
}

function categoryBadges(id: string): ReactNode {
  const category = getBackupCategory(id);
  if (!category) return null;
  return (
    <>
      {category.deviceSpecific ? <PartBadge>{t('backup_badgeDevice')}</PartBadge> : null}
      {category.large ? <PartBadge>{t('backup_badgeLarge')}</PartBadge> : null}
    </>
  );
}

/** A password and its confirmation, with the length hint and the no-recovery warning. */
function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  error,
}: {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="backup-password-fields">
      <div className="space-y-1">
        <label htmlFor={`${id}-password`} className="text-xs font-medium">
          {t('backup_password')}
        </label>
        <Input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          value={password}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-confirm`} className="text-xs font-medium">
          {t('backup_passwordConfirm')}
        </label>
        <Input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onConfirmChange(event.target.value)}
        />
      </div>
      <div id={`${id}-hint`} className="space-y-1 text-xs sm:col-span-2">
        <p className="text-muted-foreground">
          {t('backup_passwordHint', String(BACKUP_LIMITS.minPasswordLength))}
        </p>
        {error ? (
          <p role="alert" className="text-destructive-text">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type BackupExportDefaults = {
  categories: readonly string[];
  encryptByDefault: boolean;
  encryptSecrets: boolean;
};

type BackupExportDialogProps = {
  open: boolean;
  defaults: BackupExportDefaults;
  onOpenChange: (open: boolean) => void;
  /** Saves the file; rejects with a message to show in the dialog. */
  onSave: (request: {
    categories: string[];
    protection: 'none' | 'secrets' | 'all';
    password?: string;
  }) => Promise<BuiltBackup>;
};

/** Back up settings: what goes in the file, and its password. */
export function BackupExportDialog({
  open,
  defaults,
  onOpenChange,
  onSave,
}: BackupExportDialogProps) {
  const plainParts = BACKUP_CATEGORIES.filter((category) => !category.secret);
  const secretParts = BACKUP_CATEGORIES.filter((category) => category.secret);
  const [estimates, setEstimates] = useState<Record<string, PartEstimate> | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [keys, setKeys] = useState(false);
  const [keysConfirmed, setKeysConfirmed] = useState(false);
  const [protectAll, setProtectAll] = useState(false);
  const [protectKeys, setProtectKeys] = useState(true);
  const [keysPlainConfirmed, setKeysPlainConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const partsLabelId = useId();

  // Each opening starts from the settings (the last parts chosen on this device), never from a
  // password or keys choice made before.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(defaults.categories.filter((id) => getBackupCategory(id))));
    setKeys(false);
    setKeysConfirmed(false);
    setProtectAll(defaults.encryptByDefault);
    setProtectKeys(defaults.encryptSecrets);
    setKeysPlainConfirmed(false);
    setPassword('');
    setConfirm('');
    setError(undefined);
    setEstimates(null);
    let current = true;
    void estimateBackupParts().then(
      (result) => {
        if (current) setEstimates(result);
      },
      (failure: unknown) => {
        if (current) setError(getErrorMessage(failure));
      },
    );
    return () => {
      current = false;
    };
  }, [open, defaults]);

  const chosen = [...selected, ...(keys ? secretParts.map(({ id }) => id) : [])];
  const protection: 'none' | 'secrets' | 'all' = protectAll
    ? 'all'
    : keys && protectKeys
      ? 'secrets'
      : 'none';
  const needsPassword = protection !== 'none';
  const passwordError =
    needsPassword && password.length > 0 && password.length < BACKUP_LIMITS.minPasswordLength
      ? t('backup_passwordTooShort', String(BACKUP_LIMITS.minPasswordLength))
      : needsPassword && confirm.length > 0 && confirm !== password
        ? t('backup_passwordMismatch')
        : undefined;
  const passwordReady =
    !needsPassword || (password.length >= BACKUP_LIMITS.minPasswordLength && confirm === password);
  const canSave =
    !saving &&
    chosen.length > 0 &&
    (!keys || keysConfirmed) &&
    (!keys || needsPassword || keysPlainConfirmed) &&
    passwordReady;
  const filename =
    chosen.length > 0
      ? backupFilenamePreview(chosen, needsPassword)
      : t('backup_errorNothingSelected');

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const meta = (id: string) => {
    const estimate = estimates?.[id];
    if (!estimate) return t('backup_counting');
    if (estimate.count === 0) return t('backup_partEmpty');
    return t('backup_partMeta', [formatCount(estimate.count), formatSize(estimate.bytes)]);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await onSave({
        categories: chosen,
        protection,
        ...(needsPassword ? { password } : {}),
      });
      onOpenChange(false);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent
        className="flex max-h-dialog flex-col gap-4 overflow-hidden sm:max-w-2xl"
        data-testid="backup-export-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('newcomer_backUpSettings')}</DialogTitle>
          <DialogDescription>{t('backup_exportIntro')}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={partsLabelId} className="text-sm font-medium">
                {t('backup_partsLabel')}
              </h3>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set(plainParts.map(({ id }) => id)))}
                >
                  {t('backup_selectAll')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  {t('backup_selectNone')}
                </Button>
              </div>
            </div>
            <ul aria-labelledby={partsLabelId} className="divide-y rounded-md border">
              {plainParts.map((category) => (
                <li
                  key={category.id}
                  className="px-3 py-2.5"
                  data-testid="backup-part"
                  data-part={category.id}
                >
                  <CheckRow
                    checked={selected.has(category.id)}
                    onCheckedChange={(checked) => toggle(category.id, checked)}
                    label={t(category.labelKey)}
                    badges={categoryBadges(category.id)}
                  >
                    <p>{t(category.descriptionKey)}</p>
                    <p className="tabular-nums" data-testid="backup-part-meta">
                      {meta(category.id)}
                    </p>
                    {category.deviceSpecific ? <p>{t('backup_deviceNote')}</p> : null}
                    {estimates?.[category.id]?.notes?.map((note) => (
                      <p key={note.key}>{noteText(note)}</p>
                    ))}
                  </CheckRow>
                </li>
              ))}
            </ul>
          </section>

          {secretParts.map((category) => (
            <section
              key={category.id}
              className="space-y-2 rounded-md border px-3 py-2.5"
              data-testid="backup-part"
              data-part={category.id}
            >
              <CheckRow
                checked={keys}
                onCheckedChange={(checked) => {
                  setKeys(checked);
                  setKeysConfirmed(false);
                  setKeysPlainConfirmed(false);
                }}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(category.labelKey)}
                  </span>
                }
              >
                <p>{t(category.descriptionKey)}</p>
                <p className="tabular-nums" data-testid="backup-part-meta">
                  {meta(category.id)}
                </p>
              </CheckRow>
              {keys ? (
                <WarningNotice testId="backup-keys-warning">
                  <p>{t('backup_keysWarning')}</p>
                  <CheckRow
                    checked={keysConfirmed}
                    onCheckedChange={setKeysConfirmed}
                    label={t('backup_keysConfirm')}
                  />
                </WarningNotice>
              ) : null}
            </section>
          ))}

          <section className="space-y-3" data-testid="backup-protection">
            <CheckRow
              checked={protectAll}
              onCheckedChange={setProtectAll}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('backup_protectAll')}
                </span>
              }
            >
              <p>{t('backup_protectAllDesc')}</p>
            </CheckRow>
            {keys && !protectAll ? (
              <CheckRow
                checked={protectKeys}
                onCheckedChange={(checked) => {
                  setProtectKeys(checked);
                  setKeysPlainConfirmed(false);
                }}
                label={t('backup_protectKeys')}
              >
                <p>{t('backup_protectKeysDesc')}</p>
              </CheckRow>
            ) : null}
            {keys && !needsPassword ? (
              <WarningNotice testId="backup-keys-plain-warning">
                <p>{t('backup_keysPlainWarning')}</p>
                <CheckRow
                  checked={keysPlainConfirmed}
                  onCheckedChange={setKeysPlainConfirmed}
                  label={t('backup_keysPlainConfirm')}
                />
              </WarningNotice>
            ) : null}
            {needsPassword ? (
              <PasswordFields
                password={password}
                confirm={confirm}
                onPasswordChange={setPassword}
                onConfirmChange={setConfirm}
                error={passwordError}
              />
            ) : null}
          </section>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{t('backup_staysLocal')}</p>
          <p className="break-all" data-testid="backup-filename">
            {t('backup_fileName', filename)}
          </p>
          {error ? (
            <p role="alert" className="text-destructive-text">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t('action_cancel')}
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {t('backup_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The file name a backup of `ids` gets today, as the dialog previews it. */
function backupFilenamePreview(ids: readonly string[], isProtected: boolean): string {
  return formatBackupFilename(ids, isProtected, new Date());
}

// ---------------------------------------------------------------------------------------------

/** A file waiting for the user's review, by the name it was opened from. */
export type BackupImportSource = { opened: OpenedBackup; fileName: string };

type BackupImportDialogProps = {
  source: BackupImportSource | null;
  onClose: () => void;
  /** Imports; resolves to the outcome to show. */
  onImport: (opened: OpenedBackup, choices: Record<string, PartChoice>) => Promise<ImportOutcome>;
  /** Undo import of the outcome's record; the dialog closes after it. */
  onUndo: (operationId: string) => Promise<void>;
};

const CONFLICT_CHOICES: readonly ConflictChoice[] = ['newer', 'file', 'device'];
const CONFLICT_LABEL_KEYS: Record<ConflictChoice, MessageKey> = {
  newer: 'backup_conflictNewer',
  file: 'backup_conflictFile',
  device: 'backup_conflictDevice',
};
const STRATEGIES: readonly ImportStrategy[] = ['merge', 'replace'];
const STRATEGY_LABEL_KEYS: Record<ImportStrategy, MessageKey> = {
  merge: 'backup_strategyMerge',
  replace: 'backup_strategyReplace',
};

/** The choice conflicts of a part start on: the newer side where entries say when they changed. */
const defaultConflictChoice = (review: PartReview | undefined): ConflictChoice =>
  review?.dated ? 'newer' : 'file';

/** Whether a part starts selected: what the file holds, but not the device's or secret parts. */
function selectedByDefault(part: OpenedPart): boolean {
  const category = getBackupCategory(part.id);
  return Boolean(category && !category.secret && !category.deviceSpecific);
}

/** Restore settings: review what the file would do here, choose, import, and undo. */
export function BackupImportDialog({ source, onClose, onImport, onUndo }: BackupImportDialogProps) {
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [reviews, setReviews] = useState<Record<string, PartReview> | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [choices, setChoices] = useState<Record<string, PartChoice>>({});
  const [keysConfirmed, setKeysConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string>();
  const passwordId = useId();

  const review = useCallback(async (file: OpenedBackup) => {
    try {
      const next = await reviewBackupImport(file);
      setReviews(next);
      setChoices((current) => {
        const updated = { ...current };
        for (const [id, partReview] of Object.entries(next)) {
          updated[id] ??= { strategy: 'merge', conflicts: defaultConflictChoice(partReview) };
        }
        return updated;
      });
    } catch (failure) {
      setError(getErrorMessage(failure));
    }
  }, []);

  useEffect(() => {
    setOpened(source?.opened ?? null);
    setReviews(null);
    setChoices({});
    setKeysConfirmed(false);
    setPassword('');
    setUnlockError(undefined);
    setOutcome(null);
    setError(undefined);
    setSelected(
      new Set(
        (source?.opened.parts ?? [])
          .filter((part) => isImportablePart(part) && selectedByDefault(part))
          .map(({ id }) => id),
      ),
    );
    if (source) void review(source.opened);
  }, [source, review]);

  const unlock = async () => {
    if (!opened) return;
    setBusy(true);
    setUnlockError(undefined);
    try {
      const unlocked = await unlockBackup(opened, password);
      setOpened(unlocked);
      setPassword('');
      setSelected((current) => {
        const next = new Set(current);
        for (const part of unlocked.parts) {
          const was = opened.parts.find((candidate) => candidate.id === part.id);
          if (was?.locked && isImportablePart(part) && selectedByDefault(part)) next.add(part.id);
        }
        return next;
      });
      await review(unlocked);
    } catch (failure) {
      setUnlockError(getErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const parts = opened?.parts ?? [];
  const importable = parts.filter(isImportablePart);
  const unknown = parts.filter((part) => !part.known);
  const unreadable = parts.filter((part) => part.known && !part.locked && part.invalid);
  const locked = parts.filter((part) => part.locked);
  const chosen = importable.filter((part) => selected.has(part.id));
  const secretChosen = chosen.some((part) => getBackupCategory(part.id)?.secret);
  const replacing = chosen.filter((part) => choices[part.id]?.strategy === 'replace');
  const canImport =
    !busy && reviews !== null && chosen.length > 0 && (!secretChosen || keysConfirmed);

  const setChoice = (id: string, change: Partial<PartChoice>) =>
    setChoices((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { strategy: 'merge', conflicts: 'file' }), ...change },
    }));

  const runImport = async () => {
    if (!opened) return;
    setBusy(true);
    setError(undefined);
    try {
      const picked = Object.fromEntries(chosen.map((part) => [part.id, choices[part.id]]));
      setOutcome(await onImport(opened, picked));
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const startImport = () => {
    if (replacing.length > 0) setConfirmReplace(true);
    else void runImport();
  };

  const createdAt = opened?.createdAt ? Date.parse(opened.createdAt) : Number.NaN;
  const description = source
    ? Number.isFinite(createdAt)
      ? t('backup_importIntro', [source.fileName, formatDateTime(createdAt)])
      : t('backup_importIntroUndated', source.fileName)
    : '';

  return (
    <Dialog open={source !== null} onOpenChange={(next) => (next || busy ? undefined : onClose())}>
      <DialogContent
        className="flex max-h-dialog flex-col gap-4 overflow-hidden sm:max-w-2xl"
        data-testid="backup-import-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('backup_importTitle')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {outcome ? (
          <ImportResult outcome={outcome} />
        ) : (
          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
            {locked.length > 0 ? (
              <form
                className="space-y-2 rounded-md border p-3"
                data-testid="backup-unlock"
                onSubmit={(event) => {
                  event.preventDefault();
                  void unlock();
                }}
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('backup_lockedParts', formatList(locked.map((part) => partLabel(part))))}
                </p>
                <DialogActions className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1 space-y-1">
                    <label htmlFor={passwordId} className="text-xs font-medium">
                      {t('backup_password')}
                    </label>
                    <Input
                      id={passwordId}
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      aria-invalid={unlockError ? true : undefined}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={busy || password.length === 0}>
                    {t('backup_unlock')}
                  </Button>
                </DialogActions>
                {unlockError ? (
                  <p role="alert" className="text-xs text-destructive-text">
                    {unlockError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('backup_unlockHint')}</p>
                )}
              </form>
            ) : null}
            {unknown.length > 0 ? (
              <WarningNotice testId="backup-unknown-parts">
                <p>{t('backup_unknownParts', formatList(unknown.map((part) => part.id)))}</p>
              </WarningNotice>
            ) : null}
            {unreadable.length > 0 ? (
              <WarningNotice testId="backup-unreadable-parts">
                <p>{t('backup_unreadableParts', formatList(unreadable.map(partLabel)))}</p>
              </WarningNotice>
            ) : null}
            {importable.length > 0 ? (
              <ul className="divide-y rounded-md border" aria-label={t('backup_partsLabel')}>
                {importable.map((part) => (
                  <ImportPartRow
                    key={part.id}
                    part={part}
                    review={reviews?.[part.id]}
                    selected={selected.has(part.id)}
                    choice={choices[part.id]}
                    keysConfirmed={keysConfirmed}
                    onKeysConfirmedChange={setKeysConfirmed}
                    onSelectedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(part.id);
                        else next.delete(part.id);
                        return next;
                      })
                    }
                    onChoiceChange={(change) => setChoice(part.id, change)}
                  />
                ))}
              </ul>
            ) : locked.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('backup_nothingToImport')}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t('backup_importSafety', String(BACKUP_LIMITS.undoKeepMs / MS_PER_HOUR))}
            </p>
            {error ? (
              <p role="alert" className="text-sm text-destructive-text">
                {error}
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter className="gap-2">
          {outcome ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onUndo(outcome.operationId).finally(() => setBusy(false));
                }}
              >
                {t('backup_undoImport')}
              </Button>
              <Button onClick={onClose}>{t('action_close')}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                {t('action_cancel')}
              </Button>
              <Button disabled={!canImport} onClick={startImport}>
                {t('backup_importButton', String(chosen.length))}
              </Button>
            </>
          )}
        </DialogFooter>
        <ConfirmDialog
          open={confirmReplace}
          onOpenChange={setConfirmReplace}
          title={t('backup_replaceConfirmTitle')}
          description={t(
            'backup_replaceConfirm',
            formatList(replacing.map((part) => partLabel(part))),
          )}
          confirmLabel={t('backup_strategyReplace')}
          onConfirm={() => void runImport()}
        />
      </DialogContent>
    </Dialog>
  );
}

const partLabel = (part: Pick<OpenedPart, 'id'>) =>
  getBackupCategory(part.id) ? getBackupCategoryLabel(part.id) : part.id;

function ImportPartRow({
  part,
  review,
  selected,
  choice,
  keysConfirmed,
  onKeysConfirmedChange,
  onSelectedChange,
  onChoiceChange,
}: {
  part: OpenedPart;
  review: PartReview | undefined;
  selected: boolean;
  choice: PartChoice | undefined;
  keysConfirmed: boolean;
  onKeysConfirmedChange: (checked: boolean) => void;
  onSelectedChange: (checked: boolean) => void;
  onChoiceChange: (change: Partial<PartChoice>) => void;
}) {
  const category = getBackupCategory(part.id);
  const [showConflicts, setShowConflicts] = useState(false);
  const strategyLabelId = useId();
  const conflictLabelId = useId();
  const strategy = choice?.strategy ?? 'merge';
  const conflictOptions = CONFLICT_CHOICES.filter((option) => option !== 'newer' || review?.dated);
  const conflictItems = conflictOptions.map((value) => ({
    value,
    label: t(CONFLICT_LABEL_KEYS[value]),
  }));
  return (
    <li className="space-y-2 px-3 py-2.5" data-testid="backup-import-part" data-part={part.id}>
      <CheckRow
        checked={selected}
        onCheckedChange={onSelectedChange}
        label={partLabel(part)}
        badges={categoryBadges(part.id)}
      >
        {review ? (
          <p className="tabular-nums" data-testid="backup-review-counts">
            {t('backup_reviewCounts', [
              formatCount(review.count),
              formatCount(review.added),
              formatCount(review.changed),
              formatCount(review.unchanged),
            ])}
          </p>
        ) : (
          <p>{t('backup_counting')}</p>
        )}
        {review && review.skipped > 0 ? (
          <p>{t('backup_reviewSkipped', formatCount(review.skipped))}</p>
        ) : null}
        {category?.deviceSpecific ? <p>{t('backup_deviceNote')}</p> : null}
        {review?.notes.map((note) => (
          <p key={note.key}>{noteText(note)}</p>
        ))}
      </CheckRow>
      {selected && category?.secret ? (
        <WarningNotice testId="backup-keys-warning">
          <p>{t('backup_keysImportWarning')}</p>
          <CheckRow
            checked={keysConfirmed}
            onCheckedChange={onKeysConfirmedChange}
            label={t('backup_keysImportConfirm')}
          />
        </WarningNotice>
      ) : null}
      {/* Nothing in the file and nothing here: neither Merge nor Replace would change anything. */}
      {selected && review && (review.count > 0 || review.removed > 0) ? (
        <div className="space-y-2 pl-7">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span id={strategyLabelId} className="text-xs text-muted-foreground">
              {t('backup_strategyLabel')}
            </span>
            <SegmentedControl
              aria-labelledby={strategyLabelId}
              value={strategy}
              options={STRATEGIES.map((value) => ({ value, label: t(STRATEGY_LABEL_KEYS[value]) }))}
              onValueChange={(value) => onChoiceChange({ strategy: value as ImportStrategy })}
            />
            <span className="text-xs text-muted-foreground">
              {strategy === 'merge'
                ? t('backup_strategyMergeDesc')
                : t('backup_strategyReplaceDesc')}
            </span>
          </div>
          {strategy === 'replace' && review.removed > 0 ? (
            <p className="text-xs text-destructive-text" data-testid="backup-replace-removes">
              {t('backup_replaceRemoves', formatCount(review.removed))}
            </p>
          ) : null}
          {strategy === 'merge' && review.conflictCount > 0 ? (
            <div className="space-y-2" data-testid="backup-conflicts">
              <div className="flex flex-wrap items-center gap-2">
                <span id={conflictLabelId} className="text-xs">
                  {t('backup_conflicts', formatCount(review.conflictCount))}
                </span>
                <Select
                  value={choice?.conflicts ?? defaultConflictChoice(review)}
                  items={conflictItems}
                  onValueChange={(value) => {
                    if (value) onChoiceChange({ conflicts: value as ConflictChoice });
                  }}
                >
                  <SelectTrigger className="h-8 w-auto min-w-40" aria-labelledby={conflictLabelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conflictItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-expanded={showConflicts}
                  onClick={() => setShowConflicts((value) => !value)}
                >
                  {t('backup_conflictsEach')}
                </Button>
              </div>
              {showConflicts ? (
                <ul
                  className="divide-y rounded-md border bg-card"
                  data-testid="backup-conflict-list"
                >
                  {review.conflicts.map((conflict) => (
                    <ConflictRow
                      key={conflict.key}
                      label={conflict.label}
                      times={[conflict.deviceTime, conflict.fileTime]}
                      value={choice?.perItem?.[conflict.key] ?? choice?.conflicts ?? 'file'}
                      items={conflictItems}
                      onChange={(value) =>
                        onChoiceChange({
                          perItem: { ...(choice?.perItem ?? {}), [conflict.key]: value },
                        })
                      }
                    />
                  ))}
                  {review.conflictCount > review.conflicts.length ? (
                    <li className="px-3 py-2 text-xs text-muted-foreground">
                      {t(
                        'backup_conflictsMore',
                        formatCount(review.conflictCount - review.conflicts.length),
                      )}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ConflictRow({
  label,
  times,
  value,
  items,
  onChange,
}: {
  label: string;
  times: [number | undefined, number | undefined];
  value: ConflictChoice;
  items: { value: ConflictChoice; label: string }[];
  onChange: (value: ConflictChoice) => void;
}) {
  const id = useId();
  const [deviceTime, fileTime] = times;
  return (
    <li
      className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
      data-testid="backup-conflict"
    >
      <div className="min-w-0 flex-1">
        <p id={id} className="truncate text-sm" title={label}>
          {label}
        </p>
        {deviceTime !== undefined && fileTime !== undefined ? (
          <p className="text-muted-foreground">
            {t('backup_conflictTimes', [formatDateTime(deviceTime), formatDateTime(fileTime)])}
          </p>
        ) : null}
      </div>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (next) onChange(next as ConflictChoice);
        }}
      >
        <SelectTrigger className="h-8 w-auto min-w-40" aria-labelledby={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );
}

/** Describes the services that need a secret entered again: `Work (API Key)`, as one list. */
function describeServicesNeedingSetup(
  services: readonly { name: string; fields: AISecretField[] }[],
): string {
  const labels: Record<AISecretField, MessageKey> = {
    apiKey: 'options_apiKey',
    extraHeaders: 'options_extraHeaders',
  };
  return formatList(
    services.map(({ name, fields }) =>
      t('toast_backupServiceNeeds', [name, formatList(fields.map((field) => t(labels[field])))]),
    ),
  );
}

function ImportResult({ outcome }: { outcome: ImportOutcome }) {
  const needsSetup = Object.values(outcome.outcomes).flatMap((part) => part.needsSetup ?? []);
  const mismatches = Object.values(outcome.outcomes).reduce(
    (sum, part) => sum + part.mismatches,
    0,
  );
  return (
    <div
      className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1"
      data-testid="backup-import-result"
    >
      {outcome.failed ? (
        <WarningNotice>
          <p>
            {t('backup_importPartFailed', [
              partLabel({ id: outcome.failed.id }),
              outcome.failed.message,
            ])}
          </p>
        </WarningNotice>
      ) : (
        <p className="text-sm font-medium">{t('backup_importDone')}</p>
      )}
      <ul className="divide-y rounded-md border">
        {Object.entries(outcome.outcomes).map(([id, part]) => (
          <li
            key={id}
            className="space-y-0.5 px-3 py-2"
            data-testid="backup-outcome"
            data-part={id}
          >
            <p className="text-sm font-medium">{partLabel({ id })}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('backup_outcomeCounts', [
                formatCount(part.added),
                formatCount(part.changed),
                formatCount(part.removed),
                formatCount(part.kept),
                formatCount(part.skipped),
              ])}
            </p>
            {part.notes.map((note) => (
              <p key={note.key} className="text-xs text-muted-foreground">
                {noteText(note)}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {needsSetup.length > 0 ? (
        <WarningNotice testId="backup-needs-setup">
          <p>{t('backup_needsSetup', describeServicesNeedingSetup(needsSetup))}</p>
        </WarningNotice>
      ) : null}
      {mismatches > 0 ? (
        <WarningNotice>
          <p>{t('backup_outcomeMismatch', formatCount(mismatches))}</p>
        </WarningNotice>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('backup_inHistory')}</p>
    </div>
  );
}
