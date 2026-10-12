/**
 * `doctor`: what is installed, which browsers are connected, and what to fix. Read-only.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { config } from "./config";
import { FrameDecoder } from "./framing";
import {
  type BrowserTarget,
  browserTargets,
  clientSnippets,
  type InstallEnvironment,
  type Launcher,
  resolveTargets,
} from "./install";
import { extensionMessageSchema, type HelloMessage, PROTOCOL_VERSION } from "./protocol";
import { type DiscoveryEntry, listDiscovery, runtimeDir } from "./runtime";

/** Connects to a native host and waits for its hello, or gives up after the connect timeout. */
export function probe(entry: DiscoveryEntry): Promise<HelloMessage | undefined> {
  return new Promise((resolve) => {
    const socket = connect(entry.endpoint);
    const decoder = new FrameDecoder(config.limits.max_message_bytes);
    const finish = (hello?: HelloMessage) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(hello);
    };
    const timer = setTimeout(() => finish(), config.serve.connect_timeout_ms);
    socket.on("error", () => finish());
    socket.on("data", (chunk: Buffer) => {
      try {
        for (const raw of decoder.push(chunk)) {
          const parsed = extensionMessageSchema.safeParse(raw);
          if (parsed.success && parsed.data.type === "hello") finish(parsed.data);
        }
      } catch {
        finish();
      }
    });
  });
}

function manifestStatus(target: BrowserTarget, platform: NodeJS.Platform): string {
  if (target.registryKey) {
    const query = spawnSync("reg", ["query", target.registryKey, "/ve"], { encoding: "utf8" });
    if (query.status !== 0) return "not installed";
  }
  if (!existsSync(target.manifestPath)) return "not installed";
  try {
    const manifest = JSON.parse(readFileSync(target.manifestPath, "utf8")) as {
      path?: unknown;
      allowed_origins?: unknown;
      allowed_extensions?: unknown;
    };
    if (typeof manifest.path !== "string" || !existsSync(manifest.path)) {
      return `installed, but its launcher is missing; run install again`;
    }
    if (platform !== "win32") accessSync(manifest.path, constants.X_OK);
    const allowed = (manifest.allowed_origins ?? manifest.allowed_extensions) as
      | string[]
      | undefined;
    return `installed (${allowed?.length ?? 0} extension id${allowed?.length === 1 ? "" : "s"} allowed)`;
  } catch {
    return "installed, but unreadable or not executable; run install again";
  }
}

export async function runDoctor(
  environment: InstallEnvironment,
  launcher: Launcher,
  options: { manifestDir?: string } = {},
): Promise<string[]> {
  const lines = [`Bookmark Scout MCP bridge ${config.version} (protocol ${PROTOCOL_VERSION})`, ""];

  lines.push("Native host registrations:");
  const { manifestDir } = options;
  // In a manifest folder every browser's manifest is the same file, so it is shown once.
  const targets =
    manifestDir === undefined
      ? browserTargets(environment)
      : resolveTargets(environment, manifestDir).slice(0, 1);
  for (const target of targets) {
    const status = manifestStatus(target, environment.platform);
    if (status === "not installed" && !target.detected && manifestDir === undefined) continue;
    lines.push(`  ${manifestDir === undefined ? target.entry.name : "Manifest folder"}: ${status}`);
    lines.push(`    ${target.registryKey ?? target.manifestPath}`);
  }

  const dir = runtimeDir(environment);
  lines.push("", `Runtime folder: ${dir}`);
  if (existsSync(dir) && environment.platform !== "win32") {
    const stat = lstatSync(dir);
    if (stat.uid !== environment.uid || (stat.mode & 0o077) !== 0) {
      lines.push(
        "  Warning: other users can open it, or it is not yours. Remove it; the bridge recreates it.",
      );
    }
  }

  lines.push("", "Connected browsers:");
  const entries = listDiscovery(dir);
  for (const entry of entries) {
    const hello = await probe(entry);
    const label = `${entry.browser}, profile ${entry.profileId}`;
    if (!hello) lines.push(`  ${label}: not answering`);
    else if (hello.protocol !== PROTOCOL_VERSION) {
      lines.push(
        `  ${label}: Bookmark Scout ${hello.extensionVersion} uses protocol ${hello.protocol}; update the older side`,
      );
    } else {
      lines.push(
        `  ${label}: Bookmark Scout ${hello.extensionVersion}, ${hello.tools.length} tools`,
      );
    }
  }
  if (entries.length === 0) {
    lines.push(
      "  None. Open the browser and turn on access for local AI agents in Bookmark Scout's Options.",
    );
  }

  lines.push("", "Add the bridge to an agent:", clientSnippets(launcher));
  return lines;
}
