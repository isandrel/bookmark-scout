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
import { homedir } from "node:os";
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

const USAGE = `bookmark-scout-mcp ${config.version}

Usage:
  bookmark-scout-mcp serve [--browser <id>] [--profile <id>]
  bookmark-scout-mcp install [--browser <id>]... [--extension-id <id>]... [--dry-run]
  bookmark-scout-mcp uninstall [--dry-run]
  bookmark-scout-mcp doctor

serve picks the most recently connected browser profile unless --browser or --profile
(a profile id or its start, as doctor shows) narrows it down.
install registers with every browser found unless --browser names some
(${Object.keys(config.browsers).join(", ")}); --extension-id also allows a development build.`;

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

function installEnvironment(): InstallEnvironment {
  return { ...currentEnvironment(), home: homedir() };
}

async function main(argv: string[]): Promise<number> {
  const mode = isBrowserLaunch(argv) ? "native-host" : argv[0];
  const rest = isBrowserLaunch(argv) ? [] : argv.slice(1);

  if (mode === "native-host") {
    const host = runNativeHost({
      input: process.stdin,
      output: process.stdout,
      environment: currentEnvironment(),
      log: (message) => process.stderr.write(`bookmark-scout-mcp: ${message}\n`),
    });
    process.on("SIGTERM", host.stop);
    process.on("SIGINT", host.stop);
    await host.done;
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
      },
    });
    const launcher = currentLauncher();
    const plan = planInstall(installEnvironment(), {
      browsers: (values.browser ?? []).flatMap((value) => value.split(",")).filter(Boolean),
      extensionIds: values["extension-id"] ?? [],
      launcher,
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
    const { values } = parseArgs({ args: rest, options: { "dry-run": { type: "boolean" } } });
    const lines = applyUninstall(planUninstall(installEnvironment()), values["dry-run"] ?? false);
    console.log(lines.length > 0 ? lines.join("\n") : "Nothing to remove.");
    return 0;
  }

  if (mode === "doctor") {
    console.log((await runDoctor(installEnvironment(), currentLauncher())).join("\n"));
    return 0;
  }

  if (mode === "--version" || mode === "version") {
    console.log(config.version);
    return 0;
  }

  console.log(USAGE);
  return mode === undefined || mode === "help" || mode === "--help" || mode === "-h" ? 0 : 2;
}

if (import.meta.main) {
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
