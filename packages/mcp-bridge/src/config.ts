/**
 * The bridge's settings: `config/bridge.toml`, plus the extension's store ids from the workspace
 * `config/project.toml`. Both are imported (not read at run time), so a compiled binary carries
 * them. This is the only module that touches the raw files.
 */
import { z } from "zod";
import rawProject from "../../../config/project.toml";
import rawBridge from "../config/bridge.toml";
import packageJson from "../package.json";

const browserSchema = z.strictObject({
  name: z.string().min(1),
  family: z.enum(["chromium", "firefox"]),
  macos: z.string().min(1).optional(),
  macos_profile: z.string().min(1).optional(),
  linux: z.string().min(1).optional(),
  linux_profile: z.string().min(1).optional(),
  windows: z.string().min(1).optional(),
});

const chromiumId = z.string().regex(/^[a-p]{32}$/, "a 32-letter Chromium extension id");

const bridgeSchema = z.strictObject({
  extension: z.strictObject({
    firefox_id: z.string().min(1),
    chromium_ids: z.array(chromiumId),
  }),
  limits: z.strictObject({
    max_message_bytes: z.number().int().positive(),
    max_call_bytes: z
      .number()
      .int()
      .positive()
      .max(1024 * 1024),
    call_timeout_seconds: z.number().positive(),
    max_connections: z.number().int().positive(),
  }),
  serve: z.strictObject({
    server_name: z.string().regex(/^[a-z0-9-]+$/),
    reconnect_seconds: z.number().positive(),
    connect_timeout_ms: z.number().int().positive(),
  }),
  paths: z.strictObject({
    runtime_dir_name: z.string().regex(/^[A-Za-z0-9._-]+$/),
    data_dir_name: z.string().regex(/^[A-Za-z0-9._-]+$/),
    launcher_name: z.string().regex(/^[A-Za-z0-9._-]+$/),
  }),
  browsers: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), browserSchema),
});

const projectSchema = z.object({
  stores: z.object({ chrome: z.object({ url: z.string() }) }),
});

export type BrowserEntry = z.infer<typeof browserSchema>;
export type BridgeConfig = z.infer<typeof bridgeSchema> & {
  /** Every Chromium id allowed to start the host: the Chrome Web Store one first. */
  chromiumIds: string[];
  version: string;
};

/** The extension id at the end of a Chrome Web Store listing URL. */
export function chromeStoreId(url: string): string {
  const id = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  return chromiumId.parse(id);
}

export function parseBridgeConfig(raw: unknown, project: unknown, version: string): BridgeConfig {
  const bridge = bridgeSchema.parse(raw);
  const storeId = chromeStoreId(projectSchema.parse(project).stores.chrome.url);
  const chromiumIds = [...new Set([storeId, ...bridge.extension.chromium_ids])];
  return { ...bridge, chromiumIds, version };
}

export const config: BridgeConfig = parseBridgeConfig(rawBridge, rawProject, packageJson.version);
