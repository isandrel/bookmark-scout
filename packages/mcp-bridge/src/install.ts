/**
 * Registers the native host with the browsers for this user only: a launcher script in the
 * user's data folder, and a host manifest per browser (a file in the browser's
 * NativeMessagingHosts folder on macOS and Linux; a file plus an HKEY_CURRENT_USER registry value
 * on Windows). Chromium manifests allow the extension by origin, Firefox's by add-on id.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type BrowserEntry, config } from "./config";
import { NATIVE_HOST_NAME } from "./protocol";
import type { RuntimeEnvironment } from "./runtime";

export type InstallEnvironment = RuntimeEnvironment & { home: string };

/** How to start this program: the compiled binary, or Bun running the source. */
export type Launcher = { command: string; args: string[] };

export function currentLauncher(): Launcher {
  const compiled = import.meta.path.includes("$bunfs") || import.meta.path.includes("~BUN");
  return compiled
    ? { command: process.execPath, args: [] }
    : { command: process.execPath, args: [resolve(import.meta.dir, "cli.ts")] };
}

/** The folder `install` writes the launcher (and the Windows manifests) to. */
export function dataDir(environment: InstallEnvironment): string {
  const { env, home, platform } = environment;
  const name = config.paths.data_dir_name;
  if (platform === "win32")
    return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), name, "mcp");
  if (platform === "darwin") return join(home, "Library", "Application Support", name, "mcp");
  return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), name, "mcp");
}

export type BrowserTarget = {
  id: string;
  entry: BrowserEntry;
  manifestPath: string;
  /** Windows: the registry key whose default value names the manifest. */
  registryKey?: string;
  /** The browser's profile folder exists (always true on Windows). */
  detected: boolean;
};

/** Every browser the native host can be registered with on this platform. */
export function browserTargets(environment: InstallEnvironment): BrowserTarget[] {
  const { home, platform } = environment;
  const fileName = `${NATIVE_HOST_NAME}.json`;
  const targets: BrowserTarget[] = [];
  for (const [id, entry] of Object.entries(config.browsers)) {
    if (platform === "win32") {
      if (!entry.windows) continue;
      targets.push({
        id,
        entry,
        manifestPath: join(dataDir(environment), "manifests", id, fileName),
        registryKey: `HKCU\\${entry.windows}\\${NATIVE_HOST_NAME}`,
        detected: true,
      });
      continue;
    }
    const macos = platform === "darwin";
    const folder = macos ? entry.macos : entry.linux;
    if (!folder) continue;
    const base = macos ? join(home, "Library", "Application Support") : home;
    const profile = (macos ? entry.macos_profile : entry.linux_profile) ?? dirname(folder);
    targets.push({
      id,
      entry,
      manifestPath: join(base, folder, fileName),
      detected: existsSync(join(base, profile)),
    });
  }
  return targets;
}

const CHROMIUM_ID = /^[a-p]{32}$/;

export function hostManifest(
  entry: BrowserEntry,
  launcherPath: string,
  extraIds: readonly string[],
): Record<string, unknown> {
  const base = {
    name: NATIVE_HOST_NAME,
    description: "Bookmark Scout bridge for local AI agents",
    path: launcherPath,
    type: "stdio",
  };
  if (entry.family === "firefox") {
    const ids = [config.extension.firefox_id, ...extraIds.filter((id) => !CHROMIUM_ID.test(id))];
    return { ...base, allowed_extensions: [...new Set(ids)] };
  }
  const ids = [...config.chromiumIds, ...extraIds.filter((id) => CHROMIUM_ID.test(id))];
  return { ...base, allowed_origins: [...new Set(ids)].map((id) => `chrome-extension://${id}/`) };
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** The script a browser runs to start the native host; manifests cannot pass arguments. */
export function launcherScript(launcher: Launcher, platform: NodeJS.Platform): string {
  const words = [launcher.command, ...launcher.args];
  if (platform === "win32") {
    return `@echo off\r\n${words.map((word) => `"${word}"`).join(" ")} native-host %*\r\n`;
  }
  return `#!/bin/sh\n# Started by the browser for Bookmark Scout's local agent bridge.\nexec ${words.map(shellQuote).join(" ")} native-host "$@"\n`;
}

export function launcherPath(environment: InstallEnvironment): string {
  const extension = environment.platform === "win32" ? ".bat" : "";
  return join(dataDir(environment), `${config.paths.launcher_name}${extension}`);
}

export type InstallPlan = {
  files: { path: string; content: string; mode: number }[];
  registry: { key: string; value: string }[];
  browsers: string[];
};

export type InstallOptions = {
  /** Browser ids to register with; every detected one when empty. */
  browsers: readonly string[];
  /** Extension ids to allow besides the store ones, such as an unpacked development build. */
  extensionIds: readonly string[];
  launcher: Launcher;
};

export function planInstall(environment: InstallEnvironment, options: InstallOptions): InstallPlan {
  const available = browserTargets(environment);
  for (const id of options.browsers) {
    if (!available.some((target) => target.id === id)) {
      const known = available.map((target) => target.id).join(", ");
      throw new Error(`Unknown browser "${id}" on this system. Choose from: ${known}.`);
    }
  }
  for (const id of options.extensionIds) {
    if (!CHROMIUM_ID.test(id) && !/^[\w.+-]+@[\w.-]+$|^\{[0-9a-f-]{36}\}$/i.test(id)) {
      throw new Error(`"${id}" is not a Chromium extension id or a Firefox add-on id.`);
    }
  }
  const targets =
    options.browsers.length > 0
      ? available.filter((target) => options.browsers.includes(target.id))
      : available.filter((target) => target.detected);
  if (targets.length === 0) {
    throw new Error("No supported browser was found. Name one with --browser.");
  }
  const launcher = launcherPath(environment);
  return {
    browsers: targets.map((target) => target.id),
    files: [
      {
        path: launcher,
        content: launcherScript(options.launcher, environment.platform),
        mode: 0o755,
      },
      ...targets.map((target) => ({
        path: target.manifestPath,
        content: `${JSON.stringify(hostManifest(target.entry, launcher, options.extensionIds), null, 2)}\n`,
        mode: 0o644,
      })),
    ],
    registry: targets.flatMap((target) =>
      target.registryKey ? [{ key: target.registryKey, value: target.manifestPath }] : [],
    ),
  };
}

function runReg(args: string[]): void {
  const result = spawnSync("reg", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`reg ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

/** Writes the plan, or only describes it with dryRun. Returns what it did, one line each. */
export function applyInstall(plan: InstallPlan, dryRun: boolean): string[] {
  const lines: string[] = [];
  for (const file of plan.files) {
    lines.push(`${dryRun ? "Would write" : "Wrote"} ${file.path}`);
    if (dryRun) continue;
    mkdirSync(dirname(file.path), { recursive: true, mode: 0o755 });
    writeFileSync(file.path, file.content, { mode: file.mode });
    chmodSync(file.path, file.mode);
  }
  for (const { key, value } of plan.registry) {
    lines.push(`${dryRun ? "Would set" : "Set"} ${key} to ${value}`);
    if (!dryRun) runReg(["add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f"]);
  }
  return lines;
}

export type UninstallPlan = { files: string[]; registry: string[] };

/** Everything `install` may have written for this user, on any browser. */
export function planUninstall(environment: InstallEnvironment): UninstallPlan {
  const targets = browserTargets(environment);
  return {
    files: [launcherPath(environment), ...targets.map((target) => target.manifestPath)].filter(
      (path) => existsSync(path),
    ),
    registry: targets.flatMap((target) => (target.registryKey ? [target.registryKey] : [])),
  };
}

export function applyUninstall(plan: UninstallPlan, dryRun: boolean): string[] {
  const lines: string[] = [];
  for (const path of plan.files) {
    lines.push(`${dryRun ? "Would remove" : "Removed"} ${path}`);
    if (!dryRun) rmSync(path, { force: true });
  }
  for (const key of plan.registry) {
    if (dryRun) {
      lines.push(`Would remove ${key} if present`);
      continue;
    }
    const result = spawnSync("reg", ["delete", key, "/f"], { encoding: "utf8" });
    if (result.status === 0) lines.push(`Removed ${key}`);
  }
  return lines;
}

const displayQuote = (value: string) =>
  /^[\w./:@+-]+$/.test(value) ? value : JSON.stringify(value);

/** How to add the bridge to Claude Code, Codex, and Cursor, for `install` and `doctor` to print. */
export function clientSnippets(launcher: Launcher): string {
  const name = config.serve.server_name;
  const args = [...launcher.args, "serve"];
  const command = [launcher.command, ...args].map(displayQuote).join(" ");
  const cursor = { mcpServers: { [name]: { command: launcher.command, args } } };
  return [
    "Claude Code:",
    `  claude mcp add --scope user ${name} -- ${command}`,
    "",
    "Codex (~/.codex/config.toml):",
    `  [mcp_servers.${name}]`,
    `  command = ${JSON.stringify(launcher.command)}`,
    `  args = ${JSON.stringify(args)}`,
    "",
    "Cursor (~/.cursor/mcp.json):",
    ...JSON.stringify(cursor, null, 2)
      .split("\n")
      .map((line) => `  ${line}`),
  ].join("\n");
}
