/**
 * The native messaging host: the browser starts it when the extension turns the bridge on, and
 * stops it (closes stdin) when the extension turns it off or the browser quits. It listens on the
 * profile's local endpoint and relays messages between the extension and agent connections
 * (`serve`), giving each connection's call ids a prefix so results go back to the right one.
 *
 * It decides nothing: the extension checks every call (which actions are on, approval, limits).
 */
import { chmodSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { config } from "./config";
import { encodeFrame, FrameDecoder } from "./framing";
import {
  type AgentMessage,
  agentMessageSchema,
  bridgeError,
  type ExtensionMessage,
  extensionMessageSchema,
  type HelloMessage,
} from "./protocol";
import {
  endpointPath,
  ensurePrivateDir,
  type RuntimeEnvironment,
  removeDiscovery,
  runtimeDir,
  writeDiscovery,
} from "./runtime";

export type NativeHostOptions = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  environment: RuntimeEnvironment;
  log: (message: string) => void;
};

export type NativeHost = { done: Promise<void>; stop: () => void };

export function runNativeHost(options: NativeHostOptions): NativeHost {
  const { input, output, environment, log } = options;
  const { limits } = config;
  const dir = runtimeDir(environment);
  const connections = new Set<Socket>();
  /** Calls waiting for the extension, by the id the extension sees. */
  const pending = new Map<string, { socket: Socket; id: string }>();
  let hello: HelloMessage | undefined;
  let server: Server | undefined;
  let endpoint: string | undefined;
  let startedAt = "";
  let nextConnection = 0;
  let stopped = false;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const toExtension = (message: AgentMessage) => output.write(encodeFrame(message));
  const toAgent = (socket: Socket, message: ExtensionMessage) => {
    if (!socket.destroyed) socket.write(encodeFrame(message));
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const socket of connections) socket.destroy();
    server?.close();
    const owned = hello ? removeDiscovery(dir, hello, process.pid) : false;
    if (owned && endpoint && environment.platform !== "win32") rmSync(endpoint, { force: true });
    finish();
  }

  function announce(): void {
    if (!hello || !endpoint) return;
    writeDiscovery(dir, {
      protocol: hello.protocol,
      browser: hello.browser,
      profileId: hello.profileId,
      extensionVersion: hello.extensionVersion,
      endpoint,
      pid: process.pid,
      startedAt,
    });
  }

  function listen(first: HelloMessage): void {
    ensurePrivateDir(dir, environment);
    const path = endpointPath(dir, first, environment);
    // The folder is private, so a socket file here is a previous host's that did not clean up.
    if (environment.platform !== "win32") rmSync(path, { force: true });
    server = createServer(onConnection);
    server.on("error", (error) => {
      log(`Could not listen on ${path}: ${error.message}`);
      stop();
    });
    server.listen(path, () => {
      if (environment.platform !== "win32") chmodSync(path, 0o600);
      endpoint = path;
      startedAt = new Date().toISOString();
      announce();
    });
  }

  function onHello(message: HelloMessage): void {
    if (hello && (hello.browser !== message.browser || hello.profileId !== message.profileId)) {
      log("The extension sent a different browser or profile id; ignoring it.");
      return;
    }
    const first = !hello;
    hello = message;
    if (first) listen(message);
    else announce();
    for (const socket of connections) toAgent(socket, message);
  }

  function onExtensionMessage(message: ExtensionMessage): void {
    if (message.type === "hello") {
      onHello(message);
      return;
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    toAgent(call.socket, { ...message, id: call.id });
  }

  function onAgentMessage(socket: Socket, prefix: string, message: AgentMessage): void {
    const hostId = `${prefix}${message.id}`;
    if (message.type === "cancel") {
      if (pending.delete(hostId)) toExtension({ type: "cancel", id: hostId });
      return;
    }
    const frame = encodeFrame({ ...message, id: hostId });
    if (frame.length > limits.max_call_bytes || hostId.length > 80) {
      toAgent(socket, {
        type: "result",
        id: message.id,
        isError: true,
        result: bridgeError("too_large", "The call is too large to pass to the browser."),
      });
      return;
    }
    pending.set(hostId, { socket, id: message.id });
    output.write(frame);
  }

  function onConnection(socket: Socket): void {
    if (stopped || connections.size >= limits.max_connections) {
      socket.destroy();
      return;
    }
    nextConnection += 1;
    const prefix = `${nextConnection}.`;
    const decoder = new FrameDecoder(limits.max_message_bytes);
    connections.add(socket);
    if (hello) toAgent(socket, hello);
    socket.on("data", (chunk: Buffer) => {
      let messages: unknown[];
      try {
        messages = decoder.push(chunk);
      } catch (error) {
        log(`Closed an agent connection: ${(error as Error).message}`);
        socket.destroy();
        return;
      }
      for (const raw of messages) {
        const parsed = agentMessageSchema.safeParse(raw);
        if (parsed.success) onAgentMessage(socket, prefix, parsed.data);
        else log("Ignored a malformed message from an agent connection.");
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      connections.delete(socket);
      for (const [hostId, call] of pending) {
        if (call.socket !== socket) continue;
        pending.delete(hostId);
        toExtension({ type: "cancel", id: hostId });
      }
    });
  }

  const decoder = new FrameDecoder(limits.max_message_bytes);
  input.on("data", (chunk: Buffer) => {
    let messages: unknown[];
    try {
      messages = decoder.push(chunk);
    } catch (error) {
      log(`Stopping: ${(error as Error).message}`);
      stop();
      return;
    }
    for (const raw of messages) {
      const parsed = extensionMessageSchema.safeParse(raw);
      if (parsed.success) onExtensionMessage(parsed.data);
      else log("Ignored a malformed message from the extension.");
    }
  });
  input.on("end", stop);
  input.on("close", stop);
  // The browser closed the pipe while a message was on its way: it is gone, so stop.
  output.on("error", stop);

  return { done, stop };
}
