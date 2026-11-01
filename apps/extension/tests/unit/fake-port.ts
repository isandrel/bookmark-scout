/**
 * Two connected runtime ports in memory, for code that talks over `browser.runtime.connect`: a
 * message posted on one end reaches the other end's listeners on a later microtask, cloned, and
 * disconnecting one end tells the other.
 */
type Listener<T extends unknown[]> = (...args: T) => void;

function event<T extends unknown[]>() {
  const listeners = new Set<Listener<T>>();
  return {
    addListener: (listener: Listener<T>) => listeners.add(listener),
    removeListener: (listener: Listener<T>) => listeners.delete(listener),
    hasListener: (listener: Listener<T>) => listeners.has(listener),
    fire: (...args: T) => {
      for (const listener of [...listeners]) listener(...args);
    },
  };
}

export type FakePort = Browser.runtime.Port & { connected: boolean };

/** `[client, server]`: the end the caller connects with, and the end a listener receives. */
export function portPair(
  name: string,
  sender: Browser.runtime.MessageSender,
): [FakePort, FakePort] {
  const make = (portSender?: Browser.runtime.MessageSender) => {
    const onMessage = event<[unknown, Browser.runtime.Port]>();
    const onDisconnect = event<[Browser.runtime.Port]>();
    return {
      name,
      sender: portSender,
      onMessage,
      onDisconnect,
      connected: true,
    } as unknown as FakePort & {
      onMessage: ReturnType<typeof event<[unknown, Browser.runtime.Port]>>;
      onDisconnect: ReturnType<typeof event<[Browser.runtime.Port]>>;
    };
  };
  const client = make();
  const server = make(sender);
  const link = (from: typeof client, to: typeof client) => {
    from.postMessage = (message: unknown) => {
      if (!from.connected) throw new Error('Attempting to use a disconnected port object');
      const copy = structuredClone(message);
      queueMicrotask(() => to.onMessage.fire(copy, to));
    };
    from.disconnect = () => {
      if (!from.connected) return;
      from.connected = false;
      to.connected = false;
      queueMicrotask(() => to.onDisconnect.fire(to));
    };
  };
  link(client, server);
  link(server, client);
  return [client, server];
}
