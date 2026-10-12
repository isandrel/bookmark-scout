import { describe, expect, it } from "bun:test";
import rules from "../.github/ci-scopes.toml";
import { resolveScopes, type ScopeRules } from "./ci-scopes";

const config = rules as ScopeRules;
const scopes = (...files: string[]) => resolveScopes(files, config);
const none = { bridge: false, extension: false, sites: false };
const all = { bridge: true, extension: true, sites: true };

describe("ci scopes", () => {
  it("skips everything for notes, skills, backlog, and store copy", () => {
    expect(
      scopes(
        "AGENTS.md",
        "apps/docs/AGENTS.md",
        "apps/extension/DESIGN.md",
        "apps/extension/tests/settings-matrix.md",
        "templates/README.ja.md",
        ".agents/skills/repo-maintenance/scripts/merge-queue.sh",
        "backlog/tasks/task-1 - Something.md",
        "store/privacy-policy.md",
      ),
    ).toEqual(none);
  });

  it("runs only the scopes an app file belongs to", () => {
    expect(scopes("apps/extension/src/services/ai-agent.ts")).toEqual({
      ...none,
      bridge: true,
      extension: true,
    });
    expect(scopes("apps/docs/content/docs/privacy.mdx")).toEqual({ ...none, sites: true });
    expect(scopes("apps/website/messages/privacy/en.json")).toEqual({ ...none, sites: true });
  });

  it("runs the sites for extension config, which the website reads", () => {
    expect(scopes("apps/extension/config/settings.default.toml")).toEqual(all);
  });

  it("runs every scope for shared files and for files no rule lists", () => {
    for (const file of [
      "bun.lock",
      "packages/config/src/index.ts",
      "packages/mcp-bridge/src/serve.ts",
      "config/project.toml",
      ".github/workflows/ci.yml",
      ".github/actions/setup-workspace/action.yml",
      "tsconfig.base.json",
    ]) {
      expect(scopes(file)).toEqual(all);
    }
    expect(scopes("scripts/generate-readme.ts")).toEqual(all);
  });

  it("runs nothing for an empty change list", () => {
    expect(scopes("", "  ")).toEqual(none);
  });
});
