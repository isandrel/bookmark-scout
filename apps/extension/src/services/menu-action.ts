/**
 * `defineMenuAction`, apart from `action-kit.ts`: the menu-only actions (`item-actions.ts`) need
 * only this, and the popup loads them at start for its rows, so they must not bring in the
 * agent tools' schemas and helpers that `action-kit.ts` holds.
 */

/** An action only the menus offer, without a call. */
export function defineMenuAction(
  definition: ActionDefinition & { labelKey: MessageKey; icon: ActionIconName },
): ActionDefinition & { labelKey: MessageKey; icon: ActionIconName } {
  return definition;
}
