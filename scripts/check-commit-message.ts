/**
 * Checks a commit message's first line, or a pull request title, against config/commits.toml:
 * "<emoji> <type>(<scope>)!: <summary>". Merge commits and fixup! / squash! commits pass.
 *
 * Usage:
 *   bun scripts/check-commit-message.ts <message-file>   (the commit-msg hook)
 *   bun scripts/check-commit-message.ts --title "<title>" (a pull request title)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** config/commits.toml, checked: a list of lower-case types and a positive length. */
function readConfig(): { types: string[]; max_header_length: number } {
  const raw = Bun.TOML.parse(
    readFileSync(join(import.meta.dir, "../config/commits.toml"), "utf8"),
  ) as Record<string, unknown>;
  const { types, max_header_length, ...rest } = raw;
  const typesOk =
    Array.isArray(types) &&
    types.length > 0 &&
    types.every((type) => typeof type === "string" && /^[a-z]+$/.test(type));
  const lengthOk = Number.isInteger(max_header_length) && (max_header_length as number) > 0;
  if (!typesOk || !lengthOk || Object.keys(rest).length > 0)
    throw new Error("config/commits.toml: expected types and max_header_length only");
  return { types: types as string[], max_header_length: max_header_length as number };
}
const config = readConfig();

/** Why `header` does not follow the convention, or undefined when it does. */
export function commitHeaderProblem(header: string): string | undefined {
  if (/^(Merge |Revert "|fixup! |squash! )/.test(header)) return undefined;
  const withoutPr = header.replace(/ \(#\d+\)$/, "");
  if (withoutPr.length > config.max_header_length) {
    return `the first line is ${withoutPr.length} characters; at most ${config.max_header_length}`;
  }
  const match = /^(\p{Extended_Pictographic}️?) ([a-z]+)(\([\w./-]+\))?(!)?: (\S.*)$/u.exec(
    withoutPr,
  );
  if (!match) {
    return 'expected "<emoji> <type>(<scope>): <summary>", such as "✨ feat(extension): add a setting"';
  }
  const type = match[2];
  if (!config.types.includes(type)) {
    return `unknown type "${type}"; one of ${config.types.join(", ")}`;
  }
  return undefined;
}

if (import.meta.main) {
  const [first, second] = process.argv.slice(2);
  const header =
    first === "--title"
      ? (second ?? "")
      : (readFileSync(first ?? "", "utf8")
          .split("\n")
          .find((line) => line.trim() && !line.startsWith("#")) ?? "");
  const problem = commitHeaderProblem(header.trim());
  if (problem) {
    console.error(`Commit message or PR title: ${problem}\n  ${header.trim()}`);
    process.exit(1);
  }
}
