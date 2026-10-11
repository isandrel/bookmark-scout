/**
 * Options > AI > Local AI agents, below its switch: whether the bridge program is running
 * (`agentBridgeStatusValue`, kept by the background), how to install it, and which actions local
 * agents may use.
 */

/** What each state says, and whether Try again helps. */
const STATUS_TEXT: Record<AgentBridgeState, { key: MessageKey; retry: boolean }> = {
  off: { key: 'agentBridge_statusOff', retry: false },
  connecting: { key: 'agentBridge_statusConnecting', retry: false },
  ready: { key: 'agentBridge_statusReady', retry: false },
  notInstalled: { key: 'agentBridge_statusNotInstalled', retry: true },
  failed: { key: 'agentBridge_statusFailed', retry: true },
};

/** The command that registers the bridge with this computer's browsers. */
const INSTALL_COMMAND = 'bookmark-scout-mcp install';

export function AgentBridgePanel() {
  const { value: status } = useStoredValue(agentBridgeStatusValue);
  const text = STATUS_TEXT[status.state];
  const retry = () =>
    void browser.runtime.sendMessage({ type: AGENT_BRIDGE_MESSAGE.retry }).catch(() => undefined);

  return (
    <div className="space-y-3">
      <OptionsPanel
        id="agent-bridge-status"
        data-testid="agent-bridge-status"
        title={t('agentBridge_statusTitle')}
        description={t('agentBridge_setup', INSTALL_COMMAND)}
        actions={
          text.retry ? (
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t('agentBridge_retry')}
            </Button>
          ) : undefined
        }
      >
        <p role="status" data-state={status.state} className="text-sm">
          {t(text.key)}
        </p>
        {text.retry && status.detail && (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{status.detail}</p>
        )}
      </OptionsPanel>
      <AgentBridgeActionsPanel />
    </div>
  );
}
