/**
 * `serve`'s connection to a browser profile's native host: finds it through the discovery files,
 * keeps looking while none is running, and passes tool calls through with a timeout.
 */
import { connect, type Socket } from "node:net";
import { config } from "./config";
import { encodeFrame, FrameDecoder } from "./framing";
import {
  type AgentMessage,
  type BridgeTool,
  bridgeError,
  type ClientInfo,
  extensionMessageSchema,
  type HelloMessage,
  PROTOCOL_VERSION,
  type ResultMessage,
} from "./protocol";
import {
  type DiscoveryEntry,
  listDiscovery,
  type RuntimeEnvironment,
  runtimeDir,
  type Selection,
  selectDiscovery,
} from "./runtime";

export type LinkState =
  | { kind: "searching" }
  | { kind: "connected"; hello: HelloMessage }
  | { kind: "mismatch"; hello: HelloMessage };

type PendingCall = { resolve: (result: ResultMessage) => void };

function errorResult(id: string, code: string, message: string, hint?: string): ResultMessage {
  return { type: "result", id, isError: true, result: bridgeError(code, message, hint) };
}

export class ExtensionLink {
  state: LinkState = { kind: "searching" };
  private socket: Socket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly calls = new Map<string, PendingCall>();
  private nextId = 0;
  private stopped = false;

  constructor(
    private readonly environment: RuntimeEnvironment,
    private readonly selection: Selection,
    /** Called with the tools agents may use now: none unless connected. */
    private readonly onTools: (tools: BridgeTool[]) => void,
  ) {}

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.destroy();
  }

  private setState(state: LinkState): void {
    const before = this.state.kind === "connected" ? this.state.hello.tools : [];
    this.state = state;
    const after = state.kind === "connected" ? state.hello.tools : [];
    if (before.length > 0 || after.length > 0) this.onTools(after);
  }

  private retry(): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), config.serve.reconnect_seconds * 1000);
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    const entry = selectDiscovery(listDiscovery(runtimeDir(this.environment)), this.selection);
    if (!entry) {
      this.retry();
      return;
    }
    this.open(entry);
  }

  private open(entry: DiscoveryEntry): void {
    const socket = connect(entry.endpoint);
    this.socket = socket;
    const decoder = new FrameDecoder(config.limits.max_message_bytes);
    const handshake = setTimeout(() => socket.destroy(), config.serve.connect_timeout_ms);
    socket.on("data", (chunk: Buffer) => {
      let messages: unknown[];
      try {
        messages = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }
      for (const raw of messages) {
        const parsed = extensionMessageSchema.safeParse(raw);
        if (!parsed.success) continue;
        const message = parsed.data;
        if (message.type === "hello") {
          clearTimeout(handshake);
          if (message.protocol === PROTOCOL_VERSION) {
            this.setState({ kind: "connected", hello: message });
          } else {
            this.setState({ kind: "mismatch", hello: message });
            socket.end();
          }
          continue;
        }
        const call = this.calls.get(message.id);
        if (call) {
          this.calls.delete(message.id);
          call.resolve(message);
        }
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(handshake);
      if (this.socket === socket) this.socket = undefined;
      for (const [id, call] of this.calls) {
        call.resolve(
          errorResult(
            id,
            "unavailable",
            "The browser disconnected before answering.",
            "Try again.",
          ),
        );
      }
      this.calls.clear();
      if (this.state.kind === "connected") this.setState({ kind: "searching" });
      this.retry();
    });
  }

  private send(message: AgentMessage): void {
    this.socket?.write(encodeFrame(message));
  }

  /** Calls a tool in the extension; never throws, a failure is an error result. */
  call(
    tool: string,
    args: Record<string, unknown>,
    client: ClientInfo,
    signal?: AbortSignal,
  ): Promise<ResultMessage> {
    this.nextId += 1;
    const id = String(this.nextId);
    if (this.state.kind !== "connected" || !this.socket) {
      return Promise.resolve(
        errorResult(
          id,
          "unavailable",
          "No browser with Bookmark Scout is connected.",
          "Call bridgeStatus for how to connect one.",
        ),
      );
    }
    return new Promise((resolve) => {
      const settle = (result: ResultMessage) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        this.calls.delete(id);
        resolve(result);
      };
      const giveUp = (code: string, message: string) => {
        if (!this.calls.has(id)) return;
        this.send({ type: "cancel", id });
        settle(errorResult(id, code, message));
      };
      const onAbort = () => giveUp("cancelled", "The call was cancelled.");
      const timeout = setTimeout(
        () =>
          giveUp(
            "timeout",
            "The browser did not answer in time; a change may still be waiting for approval.",
          ),
        config.limits.call_timeout_seconds * 1000,
      );
      signal?.addEventListener("abort", onAbort, { once: true });
      this.calls.set(id, { resolve: settle });
      this.send({ type: "call", id, client, tool, args });
    });
  }
}
