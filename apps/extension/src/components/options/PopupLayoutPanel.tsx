/**
 * Options > Appearance > Popup: what the popup and side panel show and in what order, as lists to
 * check and reorder: their parts below the search row (`popupSections`), the buttons beside the
 * search box (`popupToolbarButtons`), and the hover card's details (`hoverCardFields`, while Show
 * Details on Hover is on). Each list's default is today's popup.
 */

type OrderedSetting = 'popupSections' | 'popupToolbarButtons' | 'hoverCardFields';

function OrderedSettingPanel({
  setting,
  choices,
  labelKeys,
  shownOf,
  required = [],
}: {
  setting: OrderedSetting;
  choices: readonly string[];
  labelKeys: Readonly<Record<string, MessageKey>>;
  shownOf: (stored: readonly string[]) => string[];
  required?: readonly string[];
}) {
  const { value: stored, setValue } = useSetting(setting);
  const meta = getSettingsFieldMeta()[setting];
  const save = (next: string[]) => void setValue(next).catch(notifySettingNotSaved);
  const saveShown = (shown: string[]) => save(encodeShownIds(shown, choices));
  return (
    <OrderedChoicesPanel
      id={`popup-layout-${setting}`}
      title={meta.label}
      description={meta.description}
      groups={[choices]}
      shown={shownOf(stored)}
      labelOf={(choice) => t(labelKeys[choice] ?? 'error_unknown')}
      isLocked={(choice) => required.includes(choice)}
      onChange={saveShown}
      onReset={() => save([...defaultSettings[setting]])}
      isDefault={isSameJson(stored, defaultSettings[setting])}
    />
  );
}

export function PopupLayoutPanel() {
  const { value: hoverDetails } = useSetting('showHoverDetails');
  return (
    <div className="space-y-4" data-testid="popup-layout">
      <OrderedSettingPanel
        setting="popupSections"
        choices={POPUP_SECTIONS}
        labelKeys={POPUP_SECTION_LABEL_KEYS}
        shownOf={getPopupSections}
        required={POPUP_REQUIRED_SECTIONS}
      />
      <OrderedSettingPanel
        setting="popupToolbarButtons"
        choices={POPUP_TOOLBAR_BUTTONS}
        labelKeys={POPUP_TOOLBAR_BUTTON_LABEL_KEYS}
        shownOf={getPopupToolbarButtons}
      />
      {hoverDetails ? (
        <OrderedSettingPanel
          setting="hoverCardFields"
          choices={HOVER_CARD_FIELDS}
          labelKeys={HOVER_CARD_FIELD_LABEL_KEYS}
          shownOf={getHoverCardFields}
        />
      ) : null}
    </div>
  );
}
