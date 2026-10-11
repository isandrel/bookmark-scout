/**
 * End to end: the native host started as a browser would start it, with this test playing the
 * extension on its stdin and stdout, and `serve` driven over stdio as an MCP client would.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "./config";
import { encodeFrame, FrameDecoder } from "./framing";
import { type CallMessage, type HelloMessage, PROTOCOL_VERSION } from "./protocol";
import { listDiscovery, RUNTIME_DIR_ENV } from "./runtime";

// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC responses are checked field by field with expect().
type Json = any;

const CLI = join(import.meta.dir, "cli.ts");
const ORIGIN = `chrome-extension://${config.chromiumIds[0]}/`;
const unix = process.platform !== "win32";

const HELLO: HelloMessage = {
  type: "hello",
  protocol: PROTOCOL_VERSION,
  extensionVersion: "9.9.9",
  browser: "chrome",
  profileId: "testprof01",
  tools: [
    {
      name: "searchBookmarks",
      title: "Search bookmarks",
      description: "Finds bookmarks.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: { items: { type: "array" }, total: { type: "number" } },
        required: ["items", "total"],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "deleteBookmarks",
      description: "Deletes bookmarks.",
      inputSchema: {
        type: "object",
        properties: { refs: { type: "array", items: { type: "string" } } },
      },
      annotations: { destructiveHint: true },
    },
  ],
};

/** Messages from a stream, awaited one at a time by a predicate. */
class Inbox<T> {
  private readonly items: T[] = [];
  private readonly waiters: { match: (item: T) => boolean; resolve: (item: T) => void }[] = [];

  push(item: T): void {
    const index = this.waiters.findIndex((waiter) => waiter.match(item));
    if (index >= 0) this.waiters.splice(index, 1)[0]?.resolve(item);
    else this.items.push(item);
  }

  next(match: (item: T) => boolean = () => true, ms = 5000): Promise<T> {
    const index = this.items.findIndex(match);
    if (index >= 0) return Promise.resolve(this.items.splice(index, 1)[0] as T);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for a message")), ms);
      this.waiters.push({
        match,
        resolve: (item) => {
          clearTimeout(timer);
          resolve(item);
        },
      });
    });
  }
}

async function pump(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
  for await (const chunk of stream) onChunk(chunk);
}

let runtime: string;
const env = () => ({ ...process.env, [RUNTIME_DIR_ENV]: runtime });

beforeEach(() => {
  runtime = join(mkdtempSync(join(tmpdir(), "bsmcp-")), "run");
});
afterEach(() => {
  rmSync(join(runtime, ".."), { recursive: true, force: true });
});

/** The native host as the browser starts it, with this test as the extension. */
function startHost() {
  const proc = Bun.spawn([process.execPath, CLI, ORIGIN], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: env(),
  });
  const calls = new Inbox<Record<string, unknown>>();
  const decoder = new FrameDecoder(config.limits.max_message_bytes);
  void pump(proc.stdout, (chunk) => {
    for (const message of decoder.push(chunk)) calls.push(message as Record<string, unknown>);
  });
  const send = (message: unknown) => {
    proc.stdin.write(encodeFrame(message));
    proc.stdin.flush();
  };
  return { proc, calls, send };
}

async function waitFor<T>(check: () => T | undefined, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = check();
    if (value !== undefined) return value;
    await Bun.sleep(25);
  }
  throw new Error("Timed out");
}

function openSocket(endpoint: string) {
  const socket: Socket = connect(endpoint);
  const inbox = new Inbox<Record<string, unknown>>();
  const decoder = new FrameDecoder(config.limits.max_message_bytes);
  socket.on("data", (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) inbox.push(message as Record<string, unknown>);
  });
  return { socket, inbox, send: (message: unknown) => socket.write(encodeFrame(message)) };
}

describe("native-host", () => {
  test("announces itself, relays calls both ways, and cleans up when the browser disconnects", async () => {
    const host = startHost();
    host.send(HELLO);
    const entry = await waitFor(() => listDiscovery(runtime)[0]);
    expect(entry).toMatchObject({
      browser: "chrome",
      profileId: "testprof01",
      extensionVersion: "9.9.9",
    });
    if (unix) {
      expect(statSync(runtime).mode & 0o777).toBe(0o700);
      expect(statSync(entry.endpoint).mode & 0o777).toBe(0o600);
    }

    const agent = openSocket(entry.endpoint);
    expect(await agent.inbox.next()).toMatchObject({ type: "hello", profileId: "testprof01" });

    agent.send({
      type: "call",
      id: "7",
      client: { name: "Agent" },
      tool: "searchBookmarks",
      args: { query: "x" },
    });
    const call = (await host.calls.next()) as CallMessage;
    expect(call).toMatchObject({
      type: "call",
      tool: "searchBookmarks",
      client: { name: "Agent" },
    });
    expect(call.id).not.toBe("7");
    host.send({ type: "result", id: call.id, isError: false, result: { items: [], total: 0 } });
    expect(await agent.inbox.next()).toEqual({
      type: "result",
      id: "7",
      isError: false,
      result: { items: [], total: 0 },
    });

    agent.send({
      type: "call",
      id: "8",
      client: { name: "Agent" },
      tool: "searchBookmarks",
      args: { query: "y" },
    });
    const unanswered = (await host.calls.next()) as CallMessage;
    agent.socket.destroy();
    expect(await host.calls.next()).toEqual({ type: "cancel", id: unanswered.id });

    host.proc.stdin.end();
    expect(await host.proc.exited).toBe(0);
    expect(readdirSync(runtime)).toEqual([]);
  });

  test("ignores malformed messages from an agent connection", async () => {
    const host = startHost();
    host.send(HELLO);
    const entry = await waitFor(() => listDiscovery(runtime)[0]);
    const agent = openSocket(entry.endpoint);
    await agent.inbox.next();
    agent.send({ type: "call", id: "1", tool: "searchBookmarks" });
    agent.send({ type: "call", id: "2", client: { name: "A" }, tool: "searchBookmarks", args: {} });
    expect(await host.calls.next()).toMatchObject({ tool: "searchBookmarks", args: {} });
    agent.socket.destroy();
    host.proc.stdin.end();
    await host.proc.exited;
  });
});

/** `serve`, spoken to as an MCP client over stdio (newline-delimited JSON-RPC). */
function startServe() {
  const proc = Bun.spawn([process.execPath, CLI, "serve"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: env(),
  });
  const inbox = new Inbox<Record<string, unknown>>();
  let buffered = "";
  void pump(proc.stdout, (chunk) => {
    buffered += new TextDecoder().decode(chunk);
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) inbox.push(JSON.parse(line));
  });
  let nextId = 0;
  const write = (message: unknown) => {
    proc.stdin.write(`${JSON.stringify(message)}\n`);
    proc.stdin.flush();
  };
  const request = async (method: string, params: unknown = {}) => {
    nextId += 1;
    const id = nextId;
    write({ jsonrpc: "2.0", id, method, params });
    return (await inbox.next((message) => message.id === id)) as { result?: Json; error?: Json };
  };
  const initialize = async () => {
    const response = await request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test-agent\u0007", version: "1.0" },
    });
    write({ jsonrpc: "2.0", method: "notifications/initialized" });
    return response;
  };
  const toolNames = async () =>
    ((await request("tools/list")).result.tools as { name: string }[]).map((tool) => tool.name);
  return { proc, inbox, request, initialize, toolNames };
}

describe("serve", () => {
  test("offers only bridgeStatus while no browser is connected", async () => {
    const serve = startServe();
    const init = await serve.initialize();
    expect(init.result.serverInfo.name).toBe("bookmark-scout");
    expect(init.result.capabilities.tools.listChanged).toBe(true);
    expect(await serve.toolNames()).toEqual(["bridgeStatus"]);
    const status = await serve.request("tools/call", { name: "bridgeStatus", arguments: {} });
    expect(status.result.structuredContent).toMatchObject({ connected: false, tools: 0 });
    serve.proc.stdin.end();
    expect(await serve.proc.exited).toBe(0);
  });

  test("lists the extension's tools, passes calls through, and follows the browser going away", async () => {
    const host = startHost();
    host.send(HELLO);
    await waitFor(() => listDiscovery(runtime)[0]);
    const serve = startServe();
    await serve.initialize();
    await serve.inbox.next((message) => message.method === "notifications/tools/list_changed");

    const list = (await serve.request("tools/list")).result.tools as Record<string, Json>[];
    expect(list.map((tool) => tool.name).sort()).toEqual([
      "bridgeStatus",
      "deleteBookmarks",
      "searchBookmarks",
    ]);
    const search = list.find((tool) => tool.name === "searchBookmarks");
    expect(search?.annotations).toMatchObject({ readOnlyHint: true });
    expect(search?.outputSchema?.required).toEqual(["items", "total"]);
    expect(list.find((tool) => tool.name === "deleteBookmarks")?.annotations).toMatchObject({
      destructiveHint: true,
    });

    const pending = serve.request("tools/call", {
      name: "searchBookmarks",
      arguments: { query: "docs" },
    });
    const call = (await host.calls.next()) as CallMessage;
    expect(call).toMatchObject({
      tool: "searchBookmarks",
      args: { query: "docs" },
      client: { name: "test-agent", version: "1.0" },
    });
    host.send({
      type: "result",
      id: call.id,
      isError: false,
      result: { items: [{ title: "Docs" }], total: 1 },
    });
    expect((await pending).result).toMatchObject({
      structuredContent: { items: [{ title: "Docs" }], total: 1 },
    });

    const refused = serve.request("tools/call", {
      name: "deleteBookmarks",
      arguments: { refs: ["b:1"] },
    });
    const deletion = (await host.calls.next()) as CallMessage;
    host.send({
      type: "result",
      id: deletion.id,
      isError: true,
      result: { error: { code: "not_allowed", message: "Declined." } },
    });
    const refusedResult = (await refused).result;
    expect(refusedResult.isError).toBe(true);
    expect(refusedResult.content[0].text).toContain("not_allowed");

    const status = await serve.request("tools/call", { name: "bridgeStatus", arguments: {} });
    expect(status.result.structuredContent).toMatchObject({
      connected: true,
      browser: "chrome",
      tools: 2,
    });

    host.proc.stdin.end();
    await host.proc.exited;
    await serve.inbox.next((message) => message.method === "notifications/tools/list_changed");
    expect(await serve.toolNames()).toEqual(["bridgeStatus"]);

    // The browser starts the host again (the extension reconnected): the tools come back.
    const again = startHost();
    again.send(HELLO);
    const deadline = Date.now() + config.serve.reconnect_seconds * 1000 + 5000;
    while (!(await serve.toolNames()).includes("searchBookmarks") && Date.now() < deadline) {
      await Bun.sleep(100);
    }
    expect((await serve.toolNames()).sort()).toEqual([
      "bridgeStatus",
      "deleteBookmarks",
      "searchBookmarks",
    ]);
    again.proc.stdin.end();
    await again.proc.exited;

    serve.proc.stdin.end();
    expect(await serve.proc.exited).toBe(0);
    expect(existsSync(runtime) ? readdirSync(runtime) : []).toEqual([]);
  });
});
