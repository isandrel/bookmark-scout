import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromeStoreId, config, parseBridgeConfig } from "./config";
import { NATIVE_HOST_NAME } from "./protocol";

const repo = join(import.meta.dir, "..", "..", "..");

describe("bridge config", () => {
  test("allows the Chrome Web Store id from config/project.toml first", () => {
    const project = readFileSync(join(repo, "config", "project.toml"), "utf8");
    const url = /\[stores\.chrome\][^[]*?url\s*=\s*"([^"]+)"/.exec(project)?.[1];
    expect(url).toBeDefined();
    expect(config.chromiumIds[0]).toBe(chromeStoreId(url ?? ""));
  });

  test("names the same Firefox add-on id as the extension's manifest", () => {
    const manifest = readFileSync(join(repo, "apps", "extension", "manifest.config.ts"), "utf8");
    const id = /FIREFOX_ADDON_ID\s*=\s*'([^']+)'/.exec(manifest)?.[1];
    expect(config.extension.firefox_id).toBe(id ?? "");
  });

  test("uses a native host name browsers accept", () => {
    expect(NATIVE_HOST_NAME).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
  });

  test("gives every browser a manifest location on at least one platform", () => {
    for (const entry of Object.values(config.browsers)) {
      expect(Boolean(entry.macos || entry.linux || entry.windows)).toBe(true);
    }
  });

  test("rejects unknown keys and a store URL without an extension id", () => {
    const raw = {
      extension: { firefox_id: "a@b", chromium_ids: [] },
      limits: {
        max_message_bytes: 1,
        max_call_bytes: 1,
        call_timeout_seconds: 1,
        max_connections: 1,
      },
      serve: { server_name: "x", reconnect_seconds: 1, connect_timeout_ms: 1 },
      paths: { runtime_dir_name: "x", data_dir_name: "x", launcher_name: "x" },
      browsers: {},
    };
    const project = {
      stores: {
        chrome: {
          url: "https://chromewebstore.google.com/detail/x/pmjiopaebkmoenkoodpoldfbnfncnedk",
        },
      },
    };
    expect(parseBridgeConfig(raw, project, "1.0.0").chromiumIds).toEqual([
      "pmjiopaebkmoenkoodpoldfbnfncnedk",
    ]);
    expect(() => parseBridgeConfig({ ...raw, extra: 1 }, project, "1.0.0")).toThrow();
    expect(() =>
      parseBridgeConfig(raw, { stores: { chrome: { url: "https://example.com/" } } }, "1.0.0"),
    ).toThrow();
  });
});
