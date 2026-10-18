import { useEffect, useState } from 'react';

/**
 * The built-in model's state (`getBuiltinAIStatus`, read once per page and shared), `undefined`
 * until read. While `enabled` is false nothing is read, so pages without a built-in service never
 * call the Prompt API. `poll` reads it again every `status_poll_ms` while it downloads.
 */
export function useBuiltinAIStatus(
  enabled = true,
  { poll = false }: { poll?: boolean } = {},
): BuiltinAIStatus | undefined {
  const [status, setStatus] = useState<BuiltinAIStatus>();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const unwatch = watchBuiltinAIStatus((next) => {
      if (active) setStatus(next);
    });
    void getBuiltinAIStatus().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      unwatch();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !poll || status !== 'downloading') return;
    const timer = setInterval(
      () => void getBuiltinAIStatus({ refresh: true }),
      builtinAIConfig.status_poll_ms,
    );
    return () => clearInterval(timer);
  }, [enabled, poll, status]);

  // A state read before this component mounted (the popup reads it before its first render).
  return enabled ? (status ?? peekBuiltinAIStatus()) : undefined;
}
