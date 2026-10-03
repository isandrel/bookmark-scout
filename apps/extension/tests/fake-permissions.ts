import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

/**
 * An in-memory `browser.permissions` for unit tests (WXT's fake browser does not implement it).
 * Requests are answered with `answer`; `grant` and `revoke` act like the browser's own settings
 * and fire `onAdded` / `onRemoved`.
 */

type Request = { permissions?: string[]; origins?: string[]; data_collection?: string[] };
type Listener = (permissions: Request) => void;
const KEYS = ['permissions', 'origins', 'data_collection'] as const;

export function installFakePermissions(granted: Request = {}) {
  const state = Object.fromEntries(KEYS.map((key) => [key, new Set(granted[key] ?? [])])) as Record<
    (typeof KEYS)[number],
    Set<string>
  >;
  const added = new Set<Listener>();
  const removed = new Set<Listener>();
  const control = { answer: true };

  const covers = (request: Request) =>
    KEYS.every((key) => (request[key] ?? []).every((value) => state[key].has(value)));
  const apply = (request: Request, present: boolean) => {
    for (const key of KEYS) {
      for (const value of request[key] ?? []) {
        if (present) state[key].add(value);
        else state[key].delete(value);
      }
    }
  };
  const event = (listeners: Set<Listener>) => ({
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    hasListener: (listener: Listener) => listeners.has(listener),
  });

  const grant = (request: Request) => {
    apply(request, true);
    for (const listener of added) listener(request);
  };
  const revoke = (request: Request) => {
    apply(request, false);
    for (const listener of removed) listener(request);
  };

  const permissions = fakeBrowser.permissions as unknown as Record<string, unknown>;
  permissions.contains = vi.fn(async (request: Request) => covers(request));
  permissions.request = vi.fn(async (request: Request) => {
    if (!control.answer) return false;
    if (!covers(request)) grant(request);
    return true;
  });
  permissions.remove = vi.fn(async (request: Request) => {
    revoke(request);
    return true;
  });
  permissions.onAdded = event(added);
  permissions.onRemoved = event(removed);

  return { control, grant, revoke, listenerCount: () => added.size + removed.size };
}
