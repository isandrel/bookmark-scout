/**
 * Options > Behavior > Popup menus: which actions the popup and side panel tree's bookmark rows and
 * folder rows offer, and their order within each group (`popupBookmarkMenu`, `popupFolderMenu`;
 * the groups come from `config/ui/actions.toml`). A row's first actions are its buttons and the
 * rest are in its ⋯ menu. An empty setting is the default menu.
 */

const MENUS: readonly { kind: PopupMenuKind; titleKey: MessageKey; descriptionKey: MessageKey }[] =
  [
    {
      kind: 'bookmark',
      titleKey: 'settings_popupBookmarkMenu',
      descriptionKey: 'settings_popupBookmarkMenuDesc',
    },
    {
      kind: 'folder',
      titleKey: 'settings_popupFolderMenu',
      descriptionKey: 'settings_popupFolderMenuDesc',
    },
  ];

function PopupMenuChoices({
  kind,
  titleKey,
  descriptionKey,
}: {
  kind: PopupMenuKind;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}) {
  const menu = POPUP_MENUS[kind];
  const { value: stored, setValue } = useSetting(menu.setting);
  const shown = customizePopupMenu(kind, stored).flat();
  const iconOf = (id: string) => {
    const icon = isPopupActionId(id) ? getPopupAction(id).icon : undefined;
    return icon ? ACTION_ICONS[icon] : undefined;
  };
  const kept = formatList(menu.keepOneOf.map(getPopupActionName));
  const save = (next: string[]) => void setValue(next).catch(notifySettingNotSaved);
  return (
    <OrderedChoicesPanel
      id={`popup-menu-${kind}`}
      title={t(titleKey)}
      description={`${t(descriptionKey)} ${t('settings_popupMenusButtons', String(menu.buttons))} ${t('settings_popupMenusKeep', kept)}`}
      groups={menu.sections}
      shown={shown}
      labelOf={(id) => (isPopupActionId(id) ? getPopupActionName(id) : id)}
      iconOf={iconOf}
      // One command stays, so a row always has something to offer.
      isLocked={(id, visible) =>
        (menu.keepOneOf as readonly string[]).includes(id) &&
        !menu.keepOneOf.some((other) => other !== id && visible.has(other))
      }
      onChange={(next) => {
        // At least one command stays.
        if (next.length > 0) save(encodeShownIds(next, menu.sections.flat()));
      }}
      onReset={() => save([])}
      isDefault={stored.length === 0}
    />
  );
}

export function PopupMenusPanel() {
  return (
    <div className="space-y-4" data-testid="popup-menus">
      {MENUS.map((menu) => (
        <PopupMenuChoices key={menu.kind} {...menu} />
      ))}
    </div>
  );
}
