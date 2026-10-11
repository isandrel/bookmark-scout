/**
 * The messages between the extension and the bridge. The same messages travel on both legs:
 * extension <-> native host (native messaging) and native host <-> `serve` (the local socket),
 * so the native host only relays them, renumbering call ids per agent connection.
 *
 * The extension imports this module too (`@bookmark-scout/mcp-bridge/protocol`), so it depends on
 * zod only. Every message is checked on arrival; nothing a peer sends is trusted to be well formed.
 */
import { z } from "zod";

/** Raised when a change makes old and new ends unable to talk; both sides refuse a mismatch. */
export const PROTOCOL_VERSION = 1;

/** The native messaging host name the extension connects to; lowercase, dots and underscores. */
export const NATIVE_HOST_NAME = "com.bookmark_scout.bridge";

const jsonObject = z.record(z.string(), z.unknown());

/** MCP tool names: letters, digits, underscore, hyphen, and dot (MCP allows up to 128). */
export const toolNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/);

export const toolAnnotationsSchema = z.object({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});

/** One action as agents see it; schemas are JSON Schema (the extension uses z.toJSONSchema). */
export const bridgeToolSchema = z.object({
  name: toolNameSchema,
  title: z.string().max(200).optional(),
  description: z.string().max(4000),
  inputSchema: jsonObject,
  outputSchema: jsonObject.optional(),
  annotations: toolAnnotationsSchema.optional(),
});
export type BridgeTool = z.infer<typeof bridgeToolSchema>;

/** Which browser and profile a connection reaches. The profile id is random, made once per profile. */
export const browserIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const profileIdSchema = z.string().regex(/^[a-z0-9]{8,16}$/);

/** The extension's first message, and again whenever its version or tools change. */
export const helloMessageSchema = z.object({
  type: z.literal("hello"),
  protocol: z.number().int().positive(),
  extensionVersion: z.string().max(40),
  browser: browserIdSchema,
  profileId: profileIdSchema,
  tools: z.array(bridgeToolSchema),
});
export type HelloMessage = z.infer<typeof helloMessageSchema>;

/** The answer to a call. A refused or failed call is a result with `isError`, so the model reads why. */
export const resultMessageSchema = z.object({
  type: z.literal("result"),
  id: z.string().min(1).max(80),
  isError: z.boolean(),
  result: jsonObject,
});
export type ResultMessage = z.infer<typeof resultMessageSchema>;

/** The agent as it named itself in MCP; self-reported, so shown to the user but never trusted. */
export const clientInfoSchema = z.object({
  name: z.string().max(100),
  version: z.string().max(40).optional(),
});
export type ClientInfo = z.infer<typeof clientInfoSchema>;

export const callMessageSchema = z.object({
  type: z.literal("call"),
  id: z.string().min(1).max(80),
  client: clientInfoSchema,
  tool: toolNameSchema,
  args: jsonObject,
});
export type CallMessage = z.infer<typeof callMessageSchema>;

/** The agent gave up on a call (cancelled or disconnected); the extension drops a pending approval. */
export const cancelMessageSchema = z.object({
  type: z.literal("cancel"),
  id: z.string().min(1).max(80),
});
export type CancelMessage = z.infer<typeof cancelMessageSchema>;

/** What the extension sends, and what the native host relays to agent connections. */
export const extensionMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  resultMessageSchema,
]);
export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;

/** What an agent connection sends, and what the native host relays to the extension. */
export const agentMessageSchema = z.discriminatedUnion("type", [
  callMessageSchema,
  cancelMessageSchema,
]);
export type AgentMessage = z.infer<typeof agentMessageSchema>;

/** The error shape inside a result with `isError`, matching the extension's action errors. */
export function bridgeError(code: string, message: string, hint?: string): Record<string, unknown> {
  return { error: { code, message, ...(hint ? { hint } : {}) } };
}
