import { useState } from 'react';

/**
 * Runs network work only with the optional website access: right away when it is granted,
 * otherwise after the user allows it in `WebHostAccessDialog`.
 */
export function useWebHostAccessGate() {
  const webHostAccess = useWebHostAccess();
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);

  const runWithAccess = (start: () => Promise<void>) => {
    if (webHostAccess.granted) {
      void start();
      return;
    }
    setPending(() => start);
  };

  const allow = async () => {
    const start = pending;
    // Request synchronously inside the click so the browser treats it as user-initiated.
    const permission = requestWebHostAccess();
    setPending(null);
    const granted = await permission;
    await webHostAccess.recheck();
    if (!granted) {
      toast.error({
        title: t('tools_hostAccessDenied'),
        description: t('tools_hostAccessDeniedDesc'),
      });
      return;
    }
    await start?.();
  };

  return {
    runWithAccess,
    dialogProps: {
      open: pending !== null,
      onAllow: allow,
      onCancel: () => setPending(null),
    },
  };
}
