import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "./config";
import {
  applyInstall,
  applyUninstall,
  clientSnippets,
  type InstallEnvironment,
  launcherScript,
  planInstall,
  planUninstall,
} from "./install";
import { NATIVE_HOST_NAME } from "./protocol";

const STORE_ORIGIN = `chrome-extension://${config.chromiumIds[0]}/`;
const DEV_ID = "abcdefghijklmnopabcdefghijklmnop";
const launcher = { command: "/opt/bun", args: ["/src/it's/cli.ts"] };
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsmcp-home-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function environment(
  platform: NodeJS.Platform,
  env: Record<string, string> = {},
): InstallEnvironment {
  return { platform, env, uid: 1000, user: "ada", tmp: tmpdir(), home };
}

const support = (...parts: string[]) => join(home, "Library", "Application Support", ...parts);

describe("planInstall", () => {
  test("registers with the browsers whose profile folder exists", () => {
    mkdirSync(support("Google", "Chrome"), { recursive: true });
    mkdirSync(support("Firefox"), { recursive: true });
    const plan = planInstall(environment("darwin"), { browsers: [], extensionIds: [], launcher });
    expect(plan.browsers).toEqual(["chrome", "firefox"]);
    expect(plan.files.map((file) => file.path)).toEqual([
      support("BookmarkScout", "mcp", "bookmark-scout-mcp-host"),
      support("Google", "Chrome", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`),
      support("Mozilla", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`),
    ]);
    expect(plan.registry).toEqual([]);
  });

  test("allows the store extension by origin on Chromium and by add-on id on Firefox", () => {
    const plan = planInstall(environment("linux"), {
      browsers: ["edge", "firefox"],
      extensionIds: [DEV_ID, "dev@example.com"],
      launcher,
    });
    const [, edge, firefox] = plan.files.map((file) =>
      JSON.parse(file.content.startsWith("{") ? file.content : "{}"),
    );
    expect(edge).toMatchObject({
      name: NATIVE_HOST_NAME,
      type: "stdio",
      path: join(home, ".local", "share", "BookmarkScout", "mcp", "bookmark-scout-mcp-host"),
      allowed_origins: [STORE_ORIGIN, `chrome-extension://${DEV_ID}/`],
    });
    expect(firefox.allowed_extensions).toEqual([config.extension.firefox_id, "dev@example.com"]);
    expect(plan.files[1]?.path).toBe(
      join(home, ".config", "microsoft-edge", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`),
    );
  });

  test("writes registry values and a batch launcher on Windows", () => {
    const plan = planInstall(environment("win32", { LOCALAPPDATA: "C:/Users/ada/AppData/Local" }), {
      browsers: ["chrome", "firefox"],
      extensionIds: [],
      launcher,
    });
    expect(plan.files[0]?.path.endsWith("bookmark-scout-mcp-host.bat")).toBe(true);
    expect(plan.registry.map((entry) => entry.key)).toEqual([
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
      `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    ]);
    expect(plan.registry[0]?.value).toBe(plan.files[1]?.path);
  });

  test("refuses an unknown browser, a bad extension id, or no browser at all", () => {
    const options = { browsers: [], extensionIds: [], launcher };
    expect(() => planInstall(environment("linux"), { ...options, browsers: ["netscape"] })).toThrow(
      "Unknown browser",
    );
    expect(() =>
      planInstall(environment("linux"), { ...options, browsers: ["chrome"], extensionIds: ["x"] }),
    ).toThrow("not a Chromium extension id");
    expect(() => planInstall(environment("linux"), options)).toThrow("No supported browser");
  });
});

describe("manifest folder override", () => {
  test("writes one browser's manifest into the given folder, with no registry value", () => {
    const plan = planInstall(environment("win32", { LOCALAPPDATA: "C:/x" }), {
      browsers: ["chrome"],
      extensionIds: [DEV_ID],
      launcher,
      manifestDir: "/profile/NativeMessagingHosts",
    });
    expect(plan.files[1]?.path).toBe(
      join("/profile/NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`),
    );
    expect(plan.registry).toEqual([]);
    expect(() =>
      planInstall(environment("linux"), {
        browsers: [],
        extensionIds: [],
        launcher,
        manifestDir: "/x",
      }),
    ).toThrow("exactly one --browser");
  });
});

describe("launcherScript", () => {
  test("quotes paths for the shell and passes the browser's arguments on", () => {
    expect(launcherScript(launcher, "darwin")).toContain(
      `exec '/opt/bun' '/src/it'\\''s/cli.ts' native-host "$@"`,
    );
    expect(launcherScript(launcher, "win32")).toContain(
      `"/opt/bun" "/src/it's/cli.ts" native-host %*`,
    );
  });
});

describe("applyInstall and uninstall", () => {
  test("writes the launcher executable and the manifests, then removes them", () => {
    mkdirSync(join(home, ".config", "google-chrome"), { recursive: true });
    const env = environment("linux");
    const plan = planInstall(env, { browsers: [], extensionIds: [], launcher });

    expect(applyInstall(plan, true)[0]).toStartWith("Would write");
    expect(existsSync(plan.files[0]?.path ?? "")).toBe(false);

    applyInstall(plan, false);
    const [launcherFile, manifest] = plan.files;
    if (process.platform !== "win32")
      expect(statSync(launcherFile?.path ?? "").mode & 0o777).toBe(0o755);
    expect(JSON.parse(readFileSync(manifest?.path ?? "", "utf8")).path).toBe(launcherFile?.path);

    const uninstall = planUninstall(env);
    expect(uninstall.files).toEqual([launcherFile?.path, manifest?.path]);
    applyUninstall(uninstall, false);
    expect(existsSync(manifest?.path ?? "")).toBe(false);
    expect(planUninstall(env).files).toEqual([]);
  });
});

test("client snippets name the server and start serve", () => {
  const text = clientSnippets({ command: "/usr/local/bin/bookmark-scout-mcp", args: [] });
  expect(text).toContain(
    "claude mcp add --scope user bookmark-scout -- /usr/local/bin/bookmark-scout-mcp serve",
  );
  expect(text).toContain("[mcp_servers.bookmark-scout]");
  expect(text).toContain('args = ["serve"]');
  expect(text).toContain('"mcpServers"');
});
