import { describe, expect, it } from "bun:test";
import rules from "../.github/ci-scopes.toml";
import { resolveScopes, type ScopeRules } from "./ci-scopes";

const config = rules as ScopeRules;
const scopes = (...files: string[]) => resolveScopes(files, config);

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
    ).toEqual({ extension: false, sites: false });
  });

  it("runs only the scope an app file belongs to", () => {
    expect(scopes("apps/extension/src/services/ai-agent.ts")).toEqual({
      extension: true,
      sites: false,
    });
    expect(scopes("apps/docs/content/docs/privacy.mdx")).toEqual({ extension: false, sites: true });
    expect(scopes("apps/website/messages/privacy/en.json")).toEqual({
      extension: false,
      sites: true,
    });
  });

  it("runs the sites for extension config, which the website reads", () => {
    expect(scopes("apps/extension/config/settings.default.toml")).toEqual({
      extension: true,
      sites: true,
    });
  });

  it("runs every scope for shared files and for files no rule lists", () => {
    for (const file of [
      "bun.lock",
      "packages/config/src/index.ts",
      "config/project.toml",
      ".github/workflows/ci.yml",
      "tsconfig.base.json",
    ]) {
      expect(scopes(file)).toEqual({ extension: true, sites: true });
    }
    expect(scopes("scripts/generate-readme.ts")).toEqual({ extension: true, sites: true });
  });

  it("runs nothing for an empty change list", () => {
    expect(scopes("", "  ")).toEqual({ extension: false, sites: false });
  });
});
