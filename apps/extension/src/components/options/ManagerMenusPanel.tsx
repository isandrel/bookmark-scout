/**
 * Options > Behavior > Bookmark manager menus: one tab per manager menu (the item menu, Organize,
 * the empty-space menu, and the preview's buttons), each with the commands it shows in order and
 * section breaks between its sections (`MENU_SETTING_KEYS`, read by `customizeMenu`). Drag a
 * command or a break by its handle (also a menu of moves) to reorder it or move it to another
 * section, uncheck a command to hide it, and Restore defaults brings back the configured menu.
 * Each menu keeps at least one command, and the item menu one that works on any single item
 * (`MENU_KEEP_ONE_OF`). Changes apply at once, like every setting.
 */
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

const PANEL_ID = 'manager-menus';

/** The tab, and the description under it, of each menu. */
const MENU_TEXT = {
  item: { label: 'settings_managerMenuActions', description: 'settings_managerMenuActionsDesc' },
  organize: {
    label: 'settings_managerOrganizeMenu',
    description: 'settings_managerOrganizeMenuDesc',
  },
  emptySpace: {
    label: 'settings_managerEmptySpaceMenu',
    description: 'settings_managerEmptySpaceMenuDesc',
  },
  preview: { label: 'settings_managerPreviewMenu', description: 'settings_managerPreviewMenuDesc' },
} as const satisfies Record<ActionMenuKind, { label: MessageKey; description: MessageKey }>;

/** An entry of the editor's list: a command, or the break before the next section. */
type MenuEntry = { id: string; action?: ActionId };

const breakId = (index: number) => `${MENU_SECTION_START}${index}`;

/** The menu as a list of commands and breaks, the way the editor shows it. */
function toEntries(sections: readonly (readonly ActionId[])[]): MenuEntry[] {
  return sections.flatMap((section, index) => [
    ...(index > 0 ? [{ id: breakId(index) }] : []),
    ...section.map((action) => ({ id: action, action })),
  ]);
}

/** Splits the editor's list into sections at its breaks; empty sections are dropped. */
function toSections(entries: readonly MenuEntry[]): ActionId[][] {
  const sections: ActionId[][] = [[]];
  for (const entry of entries) {
    if (entry.action) sections[sections.length - 1]?.push(entry.action);
    else sections.push([]);
  }
  return sections.filter((section) => section.length > 0);
}

/** A menu that could not be saved says so, and why, instead of quietly showing the old order. */
function notifyNotSaved(error: unknown): void {
  toast.error({
    title: tPlural('settings_statusNotSaved', 1),
    description: getErrorMessage(error),
  });
}

function actionLabel(id: ActionId): string {
  const action = getAction(id);
  return action.labelKey ? t(action.labelKey) : id;
}

function MenuEditor({ kind }: { kind: ActionMenuKind }) {
  const { value: stored, setValue } = useSetting(MENU_SETTING_KEYS[kind]);
  const sections = customizeMenu(kind, stored);
  // A break added at the end has no section after it yet; it waits here until one moves below it.
  const [pendingBreaks, setPendingBreaks] = useState(0);
  const entries: MenuEntry[] = [
    ...toEntries(sections),
    ...Array.from({ length: pendingBreaks }, (_, index) => ({
      id: breakId(sections.length + index),
    })),
  ];
  const hidden = getHiddenMenuActions(kind, sections);
  const kept = MENU_KEEP_ONE_OF[kind];
  const idPrefix = `${PANEL_ID}-${kind}`;

  const save = (next: readonly MenuEntry[]) => {
    // A break added at the end stays in the editor until a command follows it; one left at the
    // end by hiding or moving the commands after it goes.
    const lastAction = next.reduce((last, entry, index) => (entry.action ? index : last), -1);
    const trailing = next.length - 1 - lastAction;
    setPendingBreaks((pending) => Math.min(pending, trailing));
    void setValue(encodeMenu(toSections(next.slice(0, lastAction + 1)))).catch(notifyNotSaved);
  };
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const reorder = (ids: string[]) =>
    save(ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as MenuEntry] : [])));
  const hide = (action: ActionId) => {
    if (isLastKeptMenuAction(kind, sections, action)) return;
    save(entries.filter((entry) => entry.action !== action));
  };
  const show = (action: ActionId) => save([...entries, { id: action, action }]);
  const removeBreak = (id: string) => save(entries.filter((entry) => entry.id !== id));
  // A menu has at most one section per command.
  const canAddBreak = sections.length + pendingBreaks < sections.flat().length;
  const keptLabels = formatList(kept.map(actionLabel));

  return (
    <div className="space-y-3" data-testid={`manager-menu-${kind}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {t(MENU_TEXT[kind].description)}{' '}
          {kept.length > 0
            ? t('settings_managerMenuActionsKeep', keptLabels)
            : t('settings_managerMenuKeepOne')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canAddBreak}
            onClick={() => setPendingBreaks((count) => count + 1)}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('settings_menuAddSectionBreak')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={stored.length === 0 && pendingBreaks === 0}
            onClick={() => {
              setPendingBreaks(0);
              void setValue([]).catch(notifyNotSaved);
            }}
          >
            {t('settings_actionsReset')}
          </Button>
        </div>
      </div>
      <SortableList
        items={entries}
        getId={(entry) => entry.id}
        getLabel={(entry) =>
          entry.action ? actionLabel(entry.action) : t('settings_menuSectionBreak')
        }
        onReorder={reorder}
        label={t(MENU_TEXT[kind].label)}
        className="divide-y rounded-md border"
        itemClassName="flex min-h-10 items-center gap-2 px-2 py-1"
        itemProps={(entry): Record<`data-${string}`, string> =>
          entry.action ? { 'data-action': entry.action } : { 'data-section-break': '' }
        }
        renderItem={(entry, handle) => {
          if (!entry.action) {
            return (
              <>
                {handle}
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('settings_menuSectionBreak')}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('settings_menuRemoveSectionBreak')}
                  title={t('settings_menuRemoveSectionBreak')}
                  onClick={() => removeBreak(entry.id)}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              </>
            );
          }
          const action = getAction(entry.action);
          const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
          const checkboxId = `${idPrefix}-${entry.action}`;
          const locked = isLastKeptMenuAction(kind, sections, entry.action);
          return (
            <>
              {handle}
              <Checkbox
                id={checkboxId}
                checked
                // What the menu must keep stays (see the description).
                disabled={locked}
                onCheckedChange={(checked) => {
                  if (checked !== true && entry.action) hide(entry.action);
                }}
              />
              <label
                htmlFor={checkboxId}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm"
              >
                {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                <span className="truncate">{actionLabel(entry.action)}</span>
              </label>
            </>
          );
        }}
      />
      {hidden.length > 0 ? (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground" id={`${idPrefix}-hidden`}>
            {t('settings_menuHidden')}
          </h4>
          <ul
            aria-labelledby={`${idPrefix}-hidden`}
            className="divide-y rounded-md border"
            data-testid={`manager-menu-${kind}-hidden`}
          >
            {hidden.map((id) => {
              const action = getAction(id);
              const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
              const checkboxId = `${idPrefix}-${id}`;
              return (
                <li
                  key={id}
                  className="flex min-h-10 items-center gap-2 px-2 py-1"
                  data-action={id}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={false}
                    onCheckedChange={(checked) => {
                      if (checked === true) show(id);
                    }}
                  />
                  <label
                    htmlFor={checkboxId}
                    className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground"
                  >
                    {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{actionLabel(id)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ManagerMenusPanel() {
  return (
    <OptionsPanel
      id={PANEL_ID}
      data-testid={PANEL_ID}
      title={t('settings_managerMenus')}
      description={t('settings_managerMenusDesc')}
    >
      <Tabs defaultValue="item">
        <TabsList className="h-auto flex-wrap justify-start">
          {ACTION_MENU_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {t(MENU_TEXT[kind].label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {ACTION_MENU_KINDS.map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-3">
            <MenuEditor kind={kind} />
          </TabsContent>
        ))}
      </Tabs>
    </OptionsPanel>
  );
}
