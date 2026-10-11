import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  currentEnvironment,
  type DiscoveryEntry,
  endpointPath,
  ensurePrivateDir,
  listDiscovery,
  RUNTIME_DIR_ENV,
  type RuntimeEnvironment,
  removeDiscovery,
  runtimeDir,
  selectDiscovery,
  writeDiscovery,
} from "./runtime";

const unix = process.platform !== "win32";
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "bsmcp-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function environment(overrides: Partial<RuntimeEnvironment> = {}): RuntimeEnvironment {
  return { platform: "linux", env: {}, uid: 1000, user: "ada", tmp: "/tmp", ...overrides };
}

function entry(overrides: Partial<DiscoveryEntry> = {}): DiscoveryEntry {
  return {
    protocol: 1,
    browser: "chrome",
    profileId: "abcd1234",
    extensionVersion: "1.0.0",
    endpoint: "/tmp/x.sock",
    pid: process.pid,
    startedAt: "2026-10-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("runtimeDir", () => {
  test("prefers the override, then XDG_RUNTIME_DIR, then the temp folder with the user id", () => {
    expect(runtimeDir(environment({ env: { [RUNTIME_DIR_ENV]: "/x" } }))).toBe("/x");
    expect(runtimeDir(environment({ env: { XDG_RUNTIME_DIR: "/run/user/1000" } }))).toBe(
      "/run/user/1000/bookmark-scout-mcp",
    );
    expect(runtimeDir(environment())).toBe("/tmp/bookmark-scout-mcp-1000");
  });

  test("uses a named pipe per user and profile on Windows", () => {
    const windows = environment({ platform: "win32", user: "Ada Lovelace" });
    expect(endpointPath("C:\\x", { browser: "edge", profileId: "abcd1234" }, windows)).toBe(
      "\\\\.\\pipe\\bookmark-scout-mcp-Ada_Lovelace-edge-abcd1234",
    );
  });

  test("refuses a socket path the system cannot bind", () => {
    expect(() =>
      endpointPath(
        `/${"x".repeat(100)}`,
        { browser: "chrome", profileId: "abcd1234" },
        environment(),
      ),
    ).toThrow(RUNTIME_DIR_ENV);
  });
});

describe.if(unix)("ensurePrivateDir", () => {
  test("creates the folder for this user only and tightens an open one", () => {
    const dir = join(root, "run");
    ensurePrivateDir(dir, currentEnvironment());
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    chmodSync(dir, 0o755);
    ensurePrivateDir(dir, currentEnvironment());
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  test("refuses a link or another user's folder", () => {
    const target = join(root, "target");
    mkdirSync(target);
    symlinkSync(target, join(root, "link"));
    expect(() => ensurePrivateDir(join(root, "link"), currentEnvironment())).toThrow(
      "not a folder",
    );
    expect(() => ensurePrivateDir(target, { ...currentEnvironment(), uid: 12345 })).toThrow(
      "another user",
    );
  });
});

describe("discovery", () => {
  test("lists live hosts newest first and skips dead ones", () => {
    writeDiscovery(root, entry({ profileId: "oldprofile", startedAt: "2026-10-11T09:00:00.000Z" }));
    writeDiscovery(root, entry({ profileId: "newprofile", browser: "firefox" }));
    writeDiscovery(root, entry({ profileId: "deadprofile", pid: 2 ** 22 + 7 }));
    const entries = listDiscovery(root);
    expect(entries.map((item) => item.profileId)).toEqual(["newprofile", "oldprofile"]);
    if (unix) expect(statSync(join(root, "firefox-newprofile.json")).mode & 0o777).toBe(0o600);
  });

  test("selects by browser and by profile id or its start", () => {
    const entries = [
      entry({ browser: "firefox", profileId: "ffprofile1" }),
      entry({ profileId: "chprofile1" }),
    ];
    expect(selectDiscovery(entries, {})?.profileId).toBe("ffprofile1");
    expect(selectDiscovery(entries, { browser: "chrome" })?.profileId).toBe("chprofile1");
    expect(selectDiscovery(entries, { profile: "chpro" })?.profileId).toBe("chprofile1");
    expect(selectDiscovery(entries, { browser: "edge" })).toBeUndefined();
  });

  test("removes only its own discovery file", () => {
    writeDiscovery(root, entry());
    expect(removeDiscovery(root, entry(), process.pid + 1)).toBe(false);
    expect(listDiscovery(root)).toHaveLength(1);
    expect(removeDiscovery(root, entry(), process.pid)).toBe(true);
    expect(listDiscovery(root)).toHaveLength(0);
  });
});
