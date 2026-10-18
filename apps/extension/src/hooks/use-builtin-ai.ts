import { useCallback, useEffect, useState } from 'react';

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

/**
 * Why the model is unavailable (`getBuiltinAIUnavailableReason`), read only while `status` is
 * `unavailable`, so no download can start; `undefined` until read and in every other state.
 */
export function useBuiltinAIUnavailableReason(
  status: BuiltinAIStatus | undefined,
): BuiltinAIUnavailableReason | undefined {
  const [reason, setReason] = useState<BuiltinAIUnavailableReason>();

  useEffect(() => {
    if (status !== 'unavailable') return;
    let active = true;
    void getBuiltinAIUnavailableReason().then((next) => {
      if (active) setReason(next);
    });
    return () => {
      active = false;
    };
  }, [status]);

  return status === 'unavailable' ? reason : undefined;
}

/**
 * What the browser tells about this computer for the built-in model (`readBuiltinAIDevice`),
 * `undefined` until read; nothing is read while `enabled` is false. `reread` reads it again.
 */
export function useBuiltinAIDevice(enabled = true): {
  device: BuiltinAIDevice | undefined;
  reread: () => Promise<void>;
} {
  const [device, setDevice] = useState<BuiltinAIDevice>();

  const reread = useCallback(async () => {
    setDevice(await readBuiltinAIDevice());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void readBuiltinAIDevice().then((next) => {
      if (active) setDevice(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { device: enabled ? device : undefined, reread };
}
