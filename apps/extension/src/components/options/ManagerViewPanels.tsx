/**
 * Options > Behavior panels for the bookmark manager's views, each a checklist the user reorders
 * (`OrderedChoicesList`): Default Columns of a new or reset table view, with Reset table view and
 * Reset column widths (Manager table); what a card shows (Cards); and what a bookmark's preview
 * shows (Preview). Changes apply at once, like every setting.
 */

/** A panel over one ordered list setting, with Restore defaults and any other `actions`. */
function OrderedSettingPanel({
  id,
  setting,
  choices,
  getLabel,
  description,
  actions,
}: {
  id: string;
  setting: 'managerDefaultColumns' | 'managerCardFields' | 'previewFields';
  choices: readonly string[];
  getLabel: (id: string) => string;
  description: string;
  actions?: React.ReactNode;
}) {
  const { value, setValue } = useSetting(setting);
  const save = (next: string[]) => void setValue(next).catch(() => undefined);
  return (
    <OptionsPanel
      id={id}
      data-testid={id}
      title={t(`settings_${setting}` as MessageKey)}
      description={description}
      actionsLayout="wrap"
      actions={
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSameJson(value, defaultSettings[setting])}
            onClick={() => save([...defaultSettings[setting]])}
          >
            {t('settings_actionsReset')}
          </Button>
        </div>
      }
    >
      <OrderedChoicesList
        choices={choices}
        value={value}
        onChange={save}
        getLabel={getLabel}
        label={t(`settings_${setting}` as MessageKey)}
        idPrefix={id}
      />
    </OptionsPanel>
  );
}

/** Behavior > Manager table: Default Columns, and the buttons that bring a view back to them. */
export function ManagerColumnsPanel() {
  const { value: savedColumns } = useStoredValue(bookmarkTableViewValue);
  const { value: savedLayout } = useStoredValue(bookmarkTableLayoutValue);
  const viewSaved = Object.keys(savedColumns).length > 0 || Object.keys(savedLayout).length > 0;
  const widthsSaved = Object.keys(savedLayout.columnSizing ?? {}).length > 0;
  return (
    <OrderedSettingPanel
      id="manager-columns"
      setting="managerDefaultColumns"
      choices={HIDEABLE_COLUMN_IDS}
      getLabel={getBookmarkColumnLabel}
      description={`${t('settings_managerDefaultColumnsDesc')} ${t('settings_managerTableDefaultsNote')}`}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!viewSaved}
            onClick={() => void resetBookmarkTableView().catch(() => undefined)}
          >
            {t('settings_managerResetTableView')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!widthsSaved}
            onClick={() => void resetBookmarkColumnWidths().catch(() => undefined)}
          >
            {t('settings_managerResetColumnWidths')}
          </Button>
        </>
      }
    />
  );
}

/** Behavior > Cards: what each card of the cards view shows, in order. */
export function ManagerCardFieldsPanel() {
  return (
    <OrderedSettingPanel
      id="manager-card-fields"
      setting="managerCardFields"
      choices={MANAGER_CARD_FIELDS}
      getLabel={(field) => getManagerFieldLabel(field as ManagerCardField)}
      description={t('settings_managerCardFieldsDesc')}
    />
  );
}

/** Behavior > Preview: what a bookmark's preview shows under its title and address, in order. */
export function PreviewFieldsPanel() {
  return (
    <OrderedSettingPanel
      id="preview-fields"
      setting="previewFields"
      choices={PREVIEW_FIELDS}
      getLabel={(field) => getManagerFieldLabel(field as PreviewField)}
      description={t('settings_previewFieldsDesc')}
    />
  );
}
