/**
 * The quick save notification, drawn inside the web page the shortcut was pressed in. Plain DOM in
 * a closed shadow root, so the page's styles and scripts cannot reach it and it adds no framework
 * to the page. Every string arrives from the background already in the app language, and is set as
 * text, never as HTML. It never takes focus: it is a polite live region the keyboard can tab to,
 * Escape closes it, and its countdown pauses while it is hovered or focused.
 *
 * The host hangs off `<html>`, not `<body>`, and goes in the top layer (a manual popover) where the
 * browser has one, so a `filter` or `transform` on the page's elements cannot move it (nor, in
 * Chromium, recolor it; Firefox applies a filter on `<html>` to the top layer too); its inline
 * `!important` styles reset what the page could still pass down, direction included, and cancel
 * a `zoom` on `<html>`. After drawing, it checks it is really on screen, and removes itself
 * when not, so the background can show the result in the popup instead.
 */

import {
  QUICK_SAVE_MESSAGE,
  type QuickSaveActionMessage,
  type QuickSaveActionResponse,
  type QuickSaveRenderResult,
  type QuickSaveToastBinding,
  type QuickSaveToastView,
} from '@/lib/quick-save-protocol';

/** Sends an action to the background and resolves to its answer. */
export type QuickSaveToastSend = (
  message: QuickSaveActionMessage,
) => Promise<QuickSaveActionResponse | undefined>;

const HOST_ATTRIBUTE = 'data-bookmark-scout';
const HOST_VALUE = 'quick-save';

/**
 * The host's own box, set inline with `!important` so no page rule wins over it. `all` resets
 * everything but `direction` and `unicode-bidi`, which `render` sets from the view; the rest
 * repeats, by name, what a page most often uses to move, scale, or hide its content.
 */
const HOST_STYLES: Readonly<Record<string, string>> = {
  all: 'initial',
  display: 'block',
  position: 'fixed',
  inset: 'auto',
  'inset-block-start': '16px',
  'inset-inline-end': '16px',
  width: 'min(360px, calc(100vw - 32px))',
  height: 'auto',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'transparent',
  overflow: 'visible',
  'z-index': '2147483647',
  'unicode-bidi': 'isolate',
  'writing-mode': 'horizontal-tb',
  filter: 'none',
  transform: 'none',
  translate: 'none',
  rotate: 'none',
  scale: 'none',
  opacity: '1',
  visibility: 'visible',
  'pointer-events': 'auto',
};

/**
 * Brand tokens from apps/extension/DESIGN.md; the page has none of the extension's CSS. Light
 * values first, dark in the `[data-theme=dark]` rule.
 */
const STYLES = `
:host { all: initial; }
.toast {
  --surface: #ffffff; --sunken: #e9eef5; --ink: #0f2135; --ink-soft: #4a5b70; --line: #d6dfea;
  --teal: #0b7a80; --teal-ink: #ffffff; --teal-wash: #e1eff1; --violet: #5b3fd6;
  --success: #1d7a4a; --danger: #b42318; --warning: #8a5a00;
  box-sizing: border-box; position: relative; width: 100%; margin: 0; padding: 12px 12px 14px;
  overflow: hidden; display: flex; flex-direction: column; gap: 10px;
  background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 33, 53, 0.18);
  font: 400 14px/1.45 "Instrument Sans", "Hiragino Sans", "Apple SD Gothic Neo", "Noto Sans JP",
    "Noto Sans KR", system-ui, -apple-system, "Segoe UI", sans-serif;
  text-align: start; letter-spacing: normal; text-transform: none;
}
.toast[data-theme="dark"] {
  --surface: #132638; --sunken: #0a1622; --ink: #e8eff6; --ink-soft: #9fb2c6; --line: #23394f;
  --teal: #3cc4c9; --teal-ink: #04252a; --teal-wash: #143347; --violet: #a08bff;
  --success: #5fd49a; --danger: #ff8f85; --warning: #f0b44c;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.toast *, .toast *::before, .toast *::after { box-sizing: border-box; }
.head { display: flex; align-items: flex-start; gap: 10px; }
.icon { flex: none; width: 16px; height: 16px; margin-top: 2px; }
.icon svg { display: block; width: 16px; height: 16px; }
.toast[data-status="saved"] .icon { color: var(--success); }
.toast[data-status="duplicate"] .icon, .toast[data-status="removed"] .icon,
.toast[data-status="expired"] .icon { color: var(--ink-soft); }
.toast[data-status="failed"] .icon { color: var(--danger); }
.toast[data-status="saving"] .icon { color: var(--teal); }
.text { flex: 1; min-width: 0; }
.title { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.detail { margin: 2px 0 0; color: var(--ink-soft); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.note { margin: 6px 0 0; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.toast[data-status="failed"] .note { color: var(--danger); }
button {
  font: inherit; color: inherit; margin: 0; cursor: pointer; -webkit-appearance: none; appearance: none;
}
button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
button:disabled { cursor: default; opacity: 0.6; }
.close {
  flex: none; display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0;
  margin: -2px 0 0; margin-inline-end: -2px; border: 0; border-radius: 6px; background: transparent;
  color: var(--ink-soft);
}
.close:hover { background: var(--sunken); color: var(--ink); }
.close svg { width: 14px; height: 14px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; padding-inline-start: 26px; }
.action {
  height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--surface); font-size: 13px; font-weight: 500;
}
.action:hover { background: var(--sunken); }
.action[data-primary] { background: var(--teal); border-color: var(--teal); color: var(--teal-ink); }
.alternatives { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-inline-start: 26px; }
.alternatives-label { color: var(--ink-soft); font-size: 12px; margin-inline-end: 2px; }
.chip {
  max-width: 100%; height: 24px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9999px;
  background: var(--surface); font-size: 12px; line-height: 22px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chip:hover { background: var(--teal-wash); }
.progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; }
.progress span {
  display: block; height: 100%; background: var(--teal); transform-origin: left;
  animation: countdown var(--duration) linear forwards;
}
.toast[dir="rtl"] .progress span { transform-origin: right; }
.toast[data-paused] .progress span { animation-play-state: paused; }
@keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.spin { animation: spin 0.9s linear infinite; transform-origin: 50% 50%; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .progress { display: none; }
  .spin { animation: none; }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Lucide icons (ISC license) as path data: circle-check, info, circle-alert, loader, x. */
const ICONS: Record<QuickSaveToastView['status'] | 'close', string[]> = {
  saved: ['M21.801 10A10 10 0 1 1 17 3.335', 'm9 11 3 3L22 4'],
  duplicate: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  removed: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  expired: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  failed: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 8v4', 'M12 16h.01'],
  saving: ['M21 12a9 9 0 1 1-6.219-8.56'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
};

function icon(name: keyof typeof ICONS, className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function resolveTheme(theme: QuickSaveToastView['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyStyles(root: ShadowRoot): void {
  try {
    // A constructed sheet is not blocked by the page's Content-Security-Policy for inline styles.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = STYLES;
    root.append(style);
  }
}

/** Where the notification ended up, as measured in the page. */
export type ToastPlacement = {
  rect: { left: number; top: number; right: number; bottom: number };
  viewport: { width: number; height: number };
  /** Whether the page's hit test at the notification's center reaches it. */
  hitsCenter: boolean;
};

/**
 * Whether the notification is really on screen: inside the viewport, give or take `tolerancePx`,
 * and on top at its center. A `transform` or `filter` on an ancestor, where the top layer is not
 * available, can leave it scrolled away or under the page's own fixed elements.
 */
export function isToastOnScreen(placement: ToastPlacement, tolerancePx: number): boolean {
  const { rect, viewport, hitsCenter } = placement;
  return (
    hitsCenter &&
    rect.right > rect.left &&
    rect.bottom > rect.top &&
    rect.left >= -tolerancePx &&
    rect.top >= -tolerancePx &&
    rect.right <= viewport.width + tolerancePx &&
    rect.bottom <= viewport.height + tolerancePx
  );
}

function withoutFragment(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Whether the page still shows what `binding` names: the same document (its token) and the same
 * address, ignoring the `#fragment`, which scrolling within the page changes.
 */
export function isBoundPage(
  binding: QuickSaveToastBinding | undefined,
  current: { document: string; url: string },
): boolean {
  if (binding?.document !== undefined && binding.document !== current.document) return false;
  return (
    binding?.url === undefined || withoutFragment(binding.url) === withoutFragment(current.url)
  );
}

/**
 * The `zoom` that cancels a `zoom` on `<html>` (0.5 under `html { zoom: 2 }`), so the notification
 * keeps its size. The browser's own page zoom is not CSS zoom and is left alone.
 */
export function counterZoom(rootZoom: string): string {
  const zoom = Number.parseFloat(rootZoom);
  return Number.isFinite(zoom) && zoom > 0 && zoom !== 1 ? String(1 / zoom) : '1';
}

/** A random id for this document; `crypto.randomUUID` is missing on plain `http:` pages. */
function newDocumentToken(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byteToHex).join('');
}

function measure(host: HTMLElement): ToastPlacement {
  const box = host.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return {
    rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    hitsCenter: hit === host,
  };
}

type Mounted = {
  host: HTMLElement;
  toast: HTMLElement;
  view?: QuickSaveToastView;
  timer?: ReturnType<typeof setTimeout>;
  /** Milliseconds left on the countdown, and when it last resumed. */
  remaining?: number;
  resumedAt?: number;
  hovered: boolean;
  focused: boolean;
};

/**
 * Creates the notification controller for this page. `render` shows a view, replacing the one on
 * screen; `send` delivers button presses to the background.
 */
export function createQuickSaveToast(send: QuickSaveToastSend) {
  let mounted: Mounted | undefined;
  // One controller per document: a page the tab navigated to gets a new one, with a new token,
  // made on the first view, which says how long it is.
  let documentToken: string | undefined;

  const stopTimer = (state: Mounted) => {
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.timer = undefined;
    if (state.resumedAt !== undefined && state.remaining !== undefined) {
      state.remaining -= Date.now() - state.resumedAt;
    }
    state.resumedAt = undefined;
  };

  const syncTimer = (state: Mounted) => {
    const paused = state.hovered || state.focused;
    state.toast.toggleAttribute('data-paused', paused);
    if (state.remaining === undefined) return;
    if (paused) {
      stopTimer(state);
      return;
    }
    if (state.timer !== undefined) return;
    state.resumedAt = Date.now();
    state.timer = setTimeout(() => dismiss(true), Math.max(0, state.remaining));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.isComposing) dismiss(true);
  };

  function dismiss(notify: boolean) {
    const state = mounted;
    if (!state) return;
    mounted = undefined;
    stopTimer(state);
    document.removeEventListener('keydown', onKeyDown, true);
    state.host.remove();
    if (notify && state.view)
      void send({ type: QUICK_SAVE_MESSAGE.action, id: state.view.id, action: 'dismiss' }).catch(
        () => undefined,
      );
  }

  const act = async (message: QuickSaveActionMessage, event: Event) => {
    // Only real clicks: a script in the page cannot press these buttons for the user.
    if (!event.isTrusted || !mounted) return;
    const state = mounted;
    for (const button of state.toast.querySelectorAll('button')) button.disabled = true;
    try {
      const response = await send(message);
      if (mounted !== state) return;
      if (response?.view) render(response.view);
      else dismiss(false);
    } catch {
      if (mounted === state) {
        for (const button of state.toast.querySelectorAll('button')) button.disabled = false;
      }
    }
  };

  function mount(): Mounted {
    const host = document.createElement('div');
    host.setAttribute(HOST_ATTRIBUTE, HOST_VALUE);
    // A manual popover: no light dismiss, and the page's own popovers do not close it.
    const topLayer = typeof host.showPopover === 'function';
    if (topLayer) host.setAttribute('popover', 'manual');
    for (const [name, value] of Object.entries(HOST_STYLES)) {
      host.style.setProperty(name, value, 'important');
    }
    const root = host.attachShadow({ mode: 'closed' });
    applyStyles(root);
    const toast = element('section', 'toast');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    root.append(toast);
    const state: Mounted = { host, toast, hovered: false, focused: false };
    toast.addEventListener('pointerenter', () => {
      state.hovered = true;
      syncTimer(state);
    });
    toast.addEventListener('pointerleave', () => {
      state.hovered = false;
      syncTimer(state);
    });
    toast.addEventListener('focusin', () => {
      state.focused = true;
      syncTimer(state);
    });
    toast.addEventListener('focusout', (event) => {
      state.focused = toast.contains(event.relatedTarget as Node | null);
      syncTimer(state);
    });
    document.addEventListener('keydown', onKeyDown, true);
    // Under <html>, not <body>: a body with a transform or filter would hold a fixed box in place.
    document.documentElement.append(host);
    if (topLayer) {
      try {
        host.showPopover();
      } catch {
        // Not shown as a popover; it stays a fixed box, and the check in `render` decides.
      }
    }
    return state;
  }

  function render(
    view: QuickSaveToastView,
    binding?: QuickSaveToastBinding,
  ): QuickSaveRenderResult {
    documentToken ??= newDocumentToken(view.documentTokenBytes);
    // The tab moved on to another page since this quick save began: the popup shows the result.
    if (!isBoundPage(binding, { document: documentToken, url: location.href })) {
      return { shown: false, document: documentToken };
    }
    // A new quick save replaces the one on screen; the same one updates in place, so the live
    // region announces the change.
    if (mounted?.view && mounted.view.id !== view.id) dismiss(false);
    const state = mounted ?? mount();
    mounted = state;
    stopTimer(state);
    state.view = view;
    const { host, toast } = state;
    host.style.setProperty('direction', view.dir, 'important');
    host.style.setProperty(
      'zoom',
      counterZoom(getComputedStyle(document.documentElement).zoom),
      'important',
    );
    toast.dataset.status = view.status;
    toast.dataset.theme = resolveTheme(view.theme);
    toast.setAttribute('lang', view.lang);
    toast.setAttribute('dir', view.dir);
    toast.setAttribute('aria-label', view.label);
    toast.setAttribute('aria-busy', String(view.status === 'saving'));

    const head = element('div', 'head');
    const iconSlot = element('span', 'icon');
    iconSlot.append(icon(view.status, view.status === 'saving' ? 'spin' : undefined));
    const text = element('div', 'text');
    text.append(element('p', 'title', view.title));
    if (view.detail) text.append(element('p', 'detail', view.detail));
    if (view.note) text.append(element('p', 'note', view.note));
    const close = element('button', 'close');
    close.type = 'button';
    close.setAttribute('aria-label', view.dismissLabel);
    close.title = view.dismissLabel;
    close.append(icon('close'));
    close.addEventListener('click', (event) => {
      if (event.isTrusted) dismiss(true);
    });
    head.append(iconSlot, text, close);
    const parts: HTMLElement[] = [head];

    if (view.actions.length > 0) {
      const actions = element('div', 'actions');
      view.actions.forEach((action) => {
        const button = element('button', 'action', action.label);
        button.type = 'button';
        button.dataset.action = action.id;
        if (action.primary) button.toggleAttribute('data-primary', true);
        button.addEventListener('click', (event) =>
          act({ type: QUICK_SAVE_MESSAGE.action, id: view.id, action: action.id }, event),
        );
        actions.append(button);
      });
      parts.push(actions);
    }

    if (view.alternatives.length > 0) {
      const group = element('div', 'alternatives');
      group.setAttribute('role', 'group');
      const label = element('span', 'alternatives-label', view.alternativesLabel);
      label.id = 'alternatives-label';
      group.setAttribute('aria-labelledby', label.id);
      group.append(label);
      for (const alternative of view.alternatives) {
        const chip = element('button', 'chip', alternative.label);
        chip.type = 'button';
        chip.title = alternative.title;
        chip.dataset.alternative = String(alternative.index);
        chip.addEventListener('click', (event) =>
          act(
            {
              type: QUICK_SAVE_MESSAGE.action,
              id: view.id,
              action: 'move',
              index: alternative.index,
            },
            event,
          ),
        );
        group.append(chip);
      }
      parts.push(group);
    }

    if (view.autoDismissMs !== null) {
      const progress = element('div', 'progress');
      progress.setAttribute('aria-hidden', 'true');
      progress.append(element('span'));
      toast.style.setProperty('--duration', `${view.autoDismissMs}ms`);
      parts.push(progress);
    }
    toast.replaceChildren(...parts);

    if (!isToastOnScreen(measure(host), view.visibleTolerancePx)) {
      dismiss(false);
      return { shown: false, document: documentToken };
    }
    state.remaining = view.autoDismissMs ?? undefined;
    // The pointer may already rest where the notification appears.
    state.hovered = toast.matches(':hover');
    syncTimer(state);
    return { shown: true, document: documentToken };
  }

  return { render, dismiss: () => dismiss(false) };
}

/** The live notification element in `document`, for tests. */
export function findQuickSaveToastHost(doc: Document = document): HTMLElement | null {
  return doc.querySelector(`[${HOST_ATTRIBUTE}="${HOST_VALUE}"]`);
}
