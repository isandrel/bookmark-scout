import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";
import { clientSnippets } from "./install";

const root = join(import.meta.dir, "..");
const json = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));
const projectToml = readFileSync(join(root, "..", "..", "config", "project.toml"), "utf8");

describe("distribution metadata", () => {
  const pkg = json("package.json");
  const server = json("server.json");

  test("the MCP registry entry matches the package", () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0]).toMatchObject({
      registryType: "npm",
      identifier: pkg.name,
      version: pkg.version,
      transport: { type: "stdio" },
    });
    expect(server.packages[0].packageArguments).toEqual([{ type: "positional", value: "serve" }]);
  });

  test("the package names the project's repository and license", () => {
    expect(projectToml).toContain(`url            = "${pkg.repository.url}"`);
    expect(projectToml).toContain(`spdx = "${pkg.license}"`);
    expect(server.repository.url).toBe(pkg.repository.url);
    // The guide on the docs site, whose address is in config/web.toml.
    const webToml = readFileSync(join(root, "..", "..", "config", "web.toml"), "utf8");
    const docs = /\[docs\][^[]*?url\s*=\s*"([^"]+)"/.exec(webToml)?.[1];
    expect(pkg.homepage).toBe(`${docs}/guides/local-agents`);
    expect(server.websiteUrl).toBe(pkg.homepage);
  });

  test("the Claude Code plugin starts serve under the configured server name", () => {
    const plugin = json("claude-plugin/.claude-plugin/plugin.json");
    const servers = json("claude-plugin/.mcp.json").mcpServers;
    expect(plugin.version).toBe(pkg.version);
    expect(servers[config.serve.server_name]).toEqual({
      command: "bookmark-scout-mcp",
      args: ["serve"],
    });
    expect(clientSnippets({ command: "bookmark-scout-mcp", args: [] })).toContain(
      `claude mcp add --scope user ${config.serve.server_name} -- bookmark-scout-mcp serve`,
    );
  });

  // Node runs the npm package, so its bundle must not need Bun.
  test.if(spawnSync("node", ["--version"]).status === 0)(
    "builds a dist/cli.js that Node runs",
    () => {
      execFileSync(process.execPath, [join(root, "scripts", "build-npm.ts")]);
      const cli = join(root, "dist", "cli.js");
      expect(readFileSync(cli, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
      expect(execFileSync("node", [cli, "--version"], { encoding: "utf8" }).trim()).toBe(
        pkg.version,
      );
    },
    30_000,
  );
});
