#!/usr/bin/env bun
/**
 * bookmark-scout-mcp: lets local AI agents use Bookmark Scout's bookmark actions.
 *
 *   serve        the MCP server an agent starts (stdio)
 *   native-host  started by the browser through native messaging
 *   install      registers the native host with this user's browsers
 *   uninstall    removes what install wrote
 *   doctor       shows what is installed and connected
 */
import { appendFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { config } from "./config";
import { runDoctor } from "./doctor";
import {
  applyInstall,
  applyUninstall,
  clientSnippets,
  currentLauncher,
  type InstallEnvironment,
  planInstall,
  planUninstall,
} from "./install";
import { runNativeHost } from "./native-host";
import { currentEnvironment } from "./runtime";
import { runServe } from "./serve";

/** A file the native host also writes its messages to, for debugging what the browser started. */
const LOG_FILE_ENV = "BOOKMARK_SCOUT_MCP_LOG";

const USAGE = `bookmark-scout-mcp ${config.version}

Usage:
  bookmark-scout-mcp serve [--browser <id>] [--profile <id>]
  bookmark-scout-mcp install [--browser <id>]... [--extension-id <id>]... [--dry-run]
  bookmark-scout-mcp uninstall [--dry-run]
  bookmark-scout-mcp doctor

serve picks the most recently connected browser profile unless --browser or --profile
(a profile id or its start, as doctor shows) narrows it down.
install registers with every browser found unless --browser names some
(${Object.keys(config.browsers).join(", ")}); --extension-id also allows a development build.
For tests, install, uninstall, and doctor take --home <dir>, which puts the launcher under
another home folder, and --manifest-dir <dir>, a folder such as a test profile's
NativeMessagingHosts that holds the manifest (install also needs the one --browser).`;

/**
 * Browsers start a native host with arguments of their own: Chromium passes the caller's origin
 * (chrome-extension://<id>/), Firefox the manifest path and the add-on id. The launcher passes
 * `native-host` first, but a manifest pointing at the binary directly works too.
 */
export function isBrowserLaunch(args: readonly string[]): boolean {
  const [first, second] = args;
  if (!first) return false;
  return (
    first.startsWith("chrome-extension://") || (first.endsWith(".json") && second !== undefined)
  );
}

/** This user's environment, or one rooted at `home` (for tests) with no data-folder overrides. */
function installEnvironment(home?: string): InstallEnvironment {
  const environment = currentEnvironment();
  if (!home) return { ...environment, home: homedir() };
  const { XDG_DATA_HOME: _data, LOCALAPPDATA: _local, ...env } = environment.env;
  return { ...environment, env, home };
}

/**
 * `--home` and `--manifest-dir`, which install, uninstall, and doctor all take, so a test can
 * install, check, and remove a registration without touching the user's own folders.
 */
const TEST_LOCATION_OPTIONS = {
  home: { type: "string" },
  "manifest-dir": { type: "string" },
} as const;

function manifestDirOption(values: { "manifest-dir"?: string }): { manifestDir?: string } {
  return values["manifest-dir"] ? { manifestDir: values["manifest-dir"] } : {};
}

async function main(argv: string[]): Promise<number> {
  const mode = isBrowserLaunch(argv) ? "native-host" : argv[0];
  const rest = isBrowserLaunch(argv) ? [] : argv.slice(1);

  if (mode === "native-host") {
    const log = (message: string) => {
      const line = `bookmark-scout-mcp: ${message}\n`;
      process.stderr.write(line);
      // The browser keeps a native host's stderr to itself; this file is where to look.
      const logFile = process.env[LOG_FILE_ENV];
      if (logFile) appendFileSync(logFile, `${new Date().toISOString()} ${line}`);
    };
    process.on("uncaughtException", (error) => {
      log(`Stopped by an error: ${error.stack ?? error.message}`);
      process.exit(1);
    });
    const host = runNativeHost({
      input: process.stdin,
      output: process.stdout,
      environment: currentEnvironment(),
      log,
    });
    process.on("SIGTERM", host.stop);
    process.on("SIGINT", host.stop);
    await host.done;
    log("The browser closed the connection.");
    return 0;
  }

  if (mode === "serve") {
    const { values } = parseArgs({
      args: rest,
      options: { browser: { type: "string" }, profile: { type: "string" } },
    });
    await runServe({
      environment: currentEnvironment(),
      browser: values.browser,
      profile: values.profile,
    });
    return 0;
  }

  if (mode === "install") {
    const { values } = parseArgs({
      args: rest,
      options: {
        browser: { type: "string", multiple: true },
        "extension-id": { type: "string", multiple: true },
        "dry-run": { type: "boolean" },
        ...TEST_LOCATION_OPTIONS,
      },
    });
    const launcher = currentLauncher();
    const plan = planInstall(installEnvironment(values.home), {
      browsers: (values.browser ?? []).flatMap((value) => value.split(",")).filter(Boolean),
      extensionIds: values["extension-id"] ?? [],
      launcher,
      ...manifestDirOption(values),
    });
    const lines = applyInstall(plan, values["dry-run"] ?? false);
    console.log(
      [
        ...lines,
        "",
        `Registered for: ${plan.browsers.join(", ")}`,
        "",
        "Add the bridge to an agent:",
        clientSnippets(launcher),
      ].join("\n"),
    );
    return 0;
  }

  if (mode === "uninstall") {
    const { values } = parseArgs({
      args: rest,
      options: { "dry-run": { type: "boolean" }, ...TEST_LOCATION_OPTIONS },
    });
    const plan = planUninstall(installEnvironment(values.home), manifestDirOption(values));
    const lines = applyUninstall(plan, values["dry-run"] ?? false);
    console.log(lines.length > 0 ? lines.join("\n") : "Nothing to remove.");
    return 0;
  }

  if (mode === "doctor") {
    const { values } = parseArgs({ args: rest, options: TEST_LOCATION_OPTIONS });
    const lines = await runDoctor(
      installEnvironment(values.home),
      currentLauncher(),
      manifestDirOption(values),
    );
    console.log(lines.join("\n"));
    return 0;
  }

  if (mode === "--version" || mode === "version") {
    console.log(config.version);
    return 0;
  }

  console.log(USAGE);
  return mode === undefined || mode === "help" || mode === "--help" || mode === "-h" ? 0 : 2;
}

/** Run as a program (Bun, the compiled binary, or Node through the npm package's bin link). */
function isEntryPoint(): boolean {
  const meta = import.meta as ImportMeta & { main?: boolean };
  if (typeof meta.main === "boolean") return meta.main;
  const script = process.argv[1];
  if (!script) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(
        `bookmark-scout-mcp: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    },
  );
}
