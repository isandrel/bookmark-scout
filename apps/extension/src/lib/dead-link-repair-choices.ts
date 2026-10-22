/**
 * What the dead-link repair review can do with a link (`services/dead-link-repair.ts`), kept
 * apart so the settings schema can name them without importing the repair service.
 */
export type DeadLinkRepairChoice = 'keep' | 'delete' | 'redirect' | 'archive' | 'edit';

/** Each repair choice's label, in the review and in the default-action settings. */
export const DEAD_LINK_REPAIR_CHOICE_LABEL_KEYS = {
  keep: 'tools_deadLinkRepairChoice_keep',
  delete: 'tools_deadLinkRepairChoice_delete',
  redirect: 'tools_deadLinkRepairChoice_redirect',
  archive: 'tools_deadLinkRepairChoice_archive',
  edit: 'tools_deadLinkRepairChoice_edit',
} as const satisfies Record<DeadLinkRepairChoice, string>;
