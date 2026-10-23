/**
 * The two questions Back up settings and Restore settings ask once covers are involved: whether a
 * backup includes the covers stored on this device (with what they add to the file), and, for a
 * backup that holds covers, a review of what restoring them would do here before anything is
 * written. Without covers, both buttons work at once as before.
 */
import { useEffect, useId, useState } from 'react';
import type { CoverBackupEstimate, CoverRestorePlan } from '@/services/cover-backup.lazy';

type CoverChoiceProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  details: readonly string[];
};

/** A checkbox with the lines that explain it, read by screen readers as its description. */
function CoverChoice({ checked, onCheckedChange, label, details }: CoverChoiceProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          aria-describedby={`${id}-details`}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      </div>
      <div id={`${id}-details`} className="space-y-1 text-sm text-muted-foreground">
        {details.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

type BackupExportDialogProps = {
  /** What Include covers adds; the dialog is open while this is set. */
  estimate: CoverBackupEstimate | null;
  /** The Include Covers in Backups setting: whether the box starts checked. */
  defaultIncludeCovers: boolean;
  onCancel: () => void;
  onSave: (includeCovers: boolean) => void;
};

/** Back up settings while covers are stored: Include covers, and how much they add. */
export function BackupExportDialog({
  estimate,
  defaultIncludeCovers,
  onCancel,
  onSave,
}: BackupExportDialogProps) {
  const [includeCovers, setIncludeCovers] = useState(defaultIncludeCovers);
  // Each opening starts from the setting, not from the last choice.
  useEffect(() => {
    if (estimate) setIncludeCovers(defaultIncludeCovers);
  }, [estimate, defaultIncludeCovers]);

  return (
    <ConfirmDialog
      open={estimate !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      variant="default"
      title={t('newcomer_backUpSettings')}
      description={t('backup_exportDesc')}
      confirmLabel={t('backup_save')}
      onConfirm={() => onSave(includeCovers)}
    >
      {estimate && (
        <div data-testid="backup-covers-choice">
          <CoverChoice
            checked={includeCovers}
            onCheckedChange={setIncludeCovers}
            label={t('backup_includeCovers')}
            details={[
              t('backup_coversEstimate', [
                String(estimate.covers),
                // Under a megabyte, "0 MB" would read as nothing.
                estimate.fileBytes < BYTES_PER_MB
                  ? formatKilobytes(estimate.fileBytes)
                  : formatMegabytes(estimate.fileBytes),
              ]),
              ...(estimate.leftOut > 0
                ? [t('backup_coversLeftOut', String(estimate.leftOut))]
                : []),
            ]}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}

/** A backup that holds covers, waiting for the user to review restoring them. */
export type CoverRestoreReview = { fileName: string; plan: CoverRestorePlan };

type CoverRestoreDialogProps = {
  review: CoverRestoreReview | null;
  onCancel: () => void;
  onRestore: (restoreCovers: boolean) => void;
};

/** The review before restoring a backup that holds covers. */
export function CoverRestoreDialog({ review, onCancel, onRestore }: CoverRestoreDialogProps) {
  const [restoreCovers, setRestoreCovers] = useState(true);
  useEffect(() => {
    if (review) setRestoreCovers(true);
  }, [review]);
  const plan = review?.plan;
  const optional = (key: MessageKey, count: number) => (count > 0 ? [t(key, String(count))] : []);
  const lines = plan
    ? [
        t('backup_coversInFile', String(plan.inFile)),
        t('backup_coversMatched', String(plan.matched)),
        t('backup_coversUnmatched', String(plan.unmatched)),
        t('backup_coversAdded', String(plan.added)),
        t('backup_coversReplaced', String(plan.replaced)),
        t('backup_coversKept', String(plan.kept)),
        ...optional('backup_coversSkipped', plan.skipped),
        ...optional('backup_coversOverStorage', plan.overStorage),
      ]
    : [];

  return (
    <ConfirmDialog
      open={review !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      variant="default"
      className="max-w-lg"
      title={t('backup_restoreTitle')}
      description={t('backup_restoreDesc', review?.fileName ?? '')}
      confirmLabel={t('backup_restore')}
      onConfirm={() => onRestore(restoreCovers)}
    >
      {plan && (
        <div data-testid="backup-covers-review" className="space-y-3">
          <CoverChoice
            checked={restoreCovers}
            onCheckedChange={setRestoreCovers}
            label={t('backup_restoreCovers')}
            details={lines}
          />
          <p className="text-sm text-muted-foreground">{t('backup_restoreNoUndo')}</p>
        </div>
      )}
    </ConfirmDialog>
  );
}
