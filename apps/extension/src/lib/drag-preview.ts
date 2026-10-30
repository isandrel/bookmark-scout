/**
 * The picture that follows the pointer while manager rows or cards are dragged: one line naming
 * the item, or how many there are. Left to itself, Chromium pictured the dragged row together with
 * whatever the page drew over it (the header, the sidebar, other rows), so a drag showed a faded
 * copy of most of the page. Inline styles from the theme's tokens keep it out of the stylesheet.
 */

/** Sets `label` as the drag image of the drag `dataTransfer` belongs to. */
export function setDragPreview(dataTransfer: DataTransfer, label: string): void {
  const preview = document.createElement('div');
  preview.textContent = label;
  Object.assign(preview.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    maxWidth: `${DRAG_PREVIEW_MAX_WIDTH_PX}px`,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--foreground)',
    font: '500 13px/20px var(--font-sans, sans-serif)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(preview);
  dataTransfer.setDragImage(preview, DRAG_PREVIEW_OFFSET_PX, DRAG_PREVIEW_OFFSET_PX);
  // The browser takes its picture during dragstart; the element is not needed after it.
  setTimeout(() => preview.remove(), 0);
}
