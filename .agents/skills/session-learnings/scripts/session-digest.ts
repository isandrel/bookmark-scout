#!/usr/bin/env bun
/**
 * Condense Claude Code session transcripts (JSONL) into a readable digest for
 * mining lessons: user prompts, assistant replies, failed tool calls, and git/gh
 * commands. Raw transcripts run to tens of megabytes; the digest is a few
 * hundred kilobytes, so a reader can scan a whole session.
 *
 * Usage:
 *   bun session-digest.ts --list                 list this repository's sessions
 *   bun session-digest.ts <session-id|path.jsonl> [--since ISO] [--until ISO]
 *                                                [--text 600] [--errors 300]
 *
 * Final reports are often long: rerun with a larger --text (for example 20000) around them.
 * Subagent transcripts live in <session-id>/subagents/agent-*.jsonl next to an .meta.json
 * (description, stoppedByUser, worktreeBranch); pass their path to digest one.
 *
 * The transcript folder is derived from the current working directory the same
 * way Claude Code names it (every "/" and "." becomes "-"). Override it with
 * CLAUDE_PROJECT_DIR=<folder>.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

type Block = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  is_error?: boolean;
};
type Entry = {
  type: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { content?: string | Block[] };
  customTitle?: string;
  aiTitle?: string;
  summary?: string;
};

const NOISE_PREFIXES = [
  '<task-notification>',
  '<command-',
  '<local-command',
  '<system-reminder>',
  'Caveat:',
  '[Request interrupted',
];

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const textLimit = Number(flag('--text', '600'));
const errorLimit = Number(flag('--errors', '300'));
const since = flag('--since');
const until = flag('--until');

const projectDir =
  process.env.CLAUDE_PROJECT_DIR ??
  join(homedir(), '.claude', 'projects', process.cwd().replace(/[/.]/g, '-'));

const clip = (s: string, n: number): string => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)} …[+${flat.length - n}]` : flat;
};

const parse = (path: string): Entry[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Entry];
      } catch {
        return [];
      }
    });

const titleOf = (entries: Entry[]): string => {
  const t = entries.findLast((e) => e.customTitle || e.aiTitle || e.summary);
  return t?.customTitle ?? t?.aiTitle ?? t?.summary ?? '(untitled)';
};

if (args.includes('--list')) {
  const files = readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(projectDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    const entries = parse(file);
    const stamps = entries.map((e) => e.timestamp).filter(Boolean) as string[];
    const mb = (statSync(file).size / 1e6).toFixed(1);
    console.log(
      `${basename(file, '.jsonl')}  ${stamps[0]?.slice(0, 16) ?? '?'} → ${stamps.at(-1)?.slice(0, 16) ?? '?'}  ${mb} MB  ${titleOf(entries)}`,
    );
  }
  process.exit(0);
}

const target = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!target) {
  console.error('Pass a session id or .jsonl path, or --list.');
  process.exit(1);
}
const file = target.endsWith('.jsonl') ? target : join(projectDir, `${target}.jsonl`);
const entries = parse(file);
console.log(`# ${titleOf(entries)} (${basename(file, '.jsonl')})\n`);

const inRange = (ts?: string): boolean =>
  !ts || ((!since || ts >= since) && (!until || ts <= until));

const commandOf = (block: Block): string | undefined => {
  const cmd = block.input?.command;
  return block.name === 'Bash' && typeof cmd === 'string' && /\b(git|gh)\b/.test(cmd)
    ? cmd
    : undefined;
};

// Subagent transcripts (<session>/subagents/agent-*.jsonl) mark every entry as a sidechain; keep
// them there, and skip sidechain entries only inside a main transcript.
const isSubagentFile = file.includes('/subagents/');
for (const e of entries) {
  if ((e.isSidechain && !isSubagentFile) || !inRange(e.timestamp)) continue;
  const at = e.timestamp?.slice(5, 16).replace('T', ' ') ?? '';
  const content = e.message?.content;

  if (e.type === 'user' && typeof content === 'string') {
    if (NOISE_PREFIXES.some((p) => content.startsWith(p))) continue;
    // Compaction summaries hold the best recap of the earlier session; keep more of them.
    const limit = content.startsWith('This session is being continued') ? 6000 : 2000;
    console.log(`\n## ${at} USER\n${clip(content, limit)}`);
    continue;
  }
  if (!Array.isArray(content)) continue;

  for (const block of content) {
    if (e.type === 'assistant' && block.type === 'text' && block.text?.trim()) {
      console.log(`${at} CLAUDE: ${clip(block.text, textLimit)}`);
    } else if (e.type === 'assistant' && block.type === 'tool_use') {
      const cmd = commandOf(block);
      if (cmd) console.log(`${at} $ ${clip(cmd, 200)}`);
      else if (block.name === 'Agent' || block.name === 'Skill')
        console.log(`${at} [${block.name}] ${clip(JSON.stringify(block.input ?? {}), 200)}`);
    } else if (e.type === 'user' && block.type === 'tool_result' && block.is_error) {
      const body = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
      console.log(`${at} ERROR: ${clip(body, errorLimit)}`);
    }
  }
}
