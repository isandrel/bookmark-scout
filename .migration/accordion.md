# accordion

2026-10-01, transformation engine (legacy `default` style; wrapper customized: `hideIndicator`, a wrapped chevron, a min-width content column, and `AccordionContent` returning `null` without children). Customizations kept.

## Changed

- `apps/extension/src/components/ui/accordion.tsx`: `Accordion.Root/Item/Header/Trigger/Panel` from `@base-ui/react/accordion` (`Content` renamed to `Panel`). Class rewrites: trigger `[&[data-state=open]>svg]:rotate-180` to `[&[data-panel-open]>svg]:rotate-180`; panel `data-[state=open]:animate-accordion-down` to `data-open:animate-accordion-down` and `data-[state=closed]:animate-accordion-up` to `data-ending-style:animate-accordion-up` (Base UI accordion panels have no `data-closed`; the ending style is present while the panel closes).
- `apps/extension/tailwind.config.ts`: accordion keyframes use `--accordion-panel-height` instead of `--radix-accordion-content-height`.
- `apps/extension/src/components/page/PopupPage.tsx`: `type="multiple"` became `multiple`; `onValueChange={setExpandedFolders}` became `(value) => setExpandedFolders([...value])` because Base UI passes a readonly array plus event details.
- Leftover scan: `grep -n "radix-ui\|@radix-ui"` on these files is clean.

## Left alone

- `FolderItem.tsx`: `AccordionItem value`, `AccordionTrigger` data attributes, and `AccordionContent` usage are unchanged.
- `src/styles/popup.scss` accordion classes (not Radix-specific).

## Behavior changes

- Base UI removed roving arrow-key focus between accordion triggers. The popup tree already handles ArrowUp/Down/Home/End/Left/Right itself (`use-popup-shortcuts.ts`), and the keyboard E2E specs pass, so no visible change; any other accordion would lose arrow navigation.
- Pre-existing, unchanged: the `animate-accordion-*` utilities and the chevron rotate selector are not generated or never match (see project report), so panels open without animation before and after.

## Verify by hand

- Popup: expand and collapse folders by click, Enter, ArrowRight/ArrowLeft; expanded folders survive a search and reopen.
- "Expand all subfolders" still opens the whole branch.
