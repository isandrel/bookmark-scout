/**
 * The real AI provider the live tests use, from environment variables, or from an env file for
 * the ones the environment does not set. Shared by the tests and the redacting reporter, so both
 * know the key without printing it.
 *
 * The env file is the first that exists of: `BS_LIVE_ENV_FILE`; `apps/extension/.env.live.local`
 * in this checkout; the same file in the main checkout, so a git worktree uses the main one's.
 * `.env*.local` files are git-ignored.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_FILE_NAME = '.env.live.local';
/** Only these variables are read from the file; nothing else in it reaches the tests. */
const ENV_PREFIX = 'BS_LIVE_';
const REQUIRED = ['BS_LIVE_AI_BASE_URL', 'BS_LIVE_AI_API_KEY', 'BS_LIVE_AI_MODEL'] as const;
/** A preset in `config/ai/providers/`. */
const DEFAULT_PROVIDER = 'cliproxyapi';

/** This app's folder in the main checkout, when this checkout is a git worktree of it. */
function mainCheckoutExtensionDir(): string | null {
  try {
    const [topLevel, commonDir] = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
      { cwd: EXTENSION_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .trim()
      .split('\n');
    if (!topLevel || !commonDir) return null;
    return path.join(path.dirname(commonDir), path.relative(topLevel, EXTENSION_DIR));
  } catch {
    return null;
  }
}

function findEnvFile(): string | null {
  const override = process.env.BS_LIVE_ENV_FILE?.trim();
  if (override) return path.resolve(override);
  const candidates = [EXTENSION_DIR, mainCheckoutExtensionDir()].flatMap((directory) =>
    directory ? [path.join(directory, ENV_FILE_NAME)] : [],
  );
  return candidates.find((file) => existsSync(file)) ?? null;
}

/** `KEY=value` lines; `#` comments, `export`, and surrounding quotes are allowed. */
function readEnvFile(file: string | null): Record<string, string> {
  if (!file || !existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match?.[1].startsWith(ENV_PREFIX)) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

for (const [name, value] of Object.entries(readEnvFile(findEnvFile()))) {
  process.env[name] ??= value;
}

export type LiveAIConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

/** Names of the required variables that are not set. */
export const missingLiveVariables: readonly string[] = REQUIRED.filter(
  (name) => !process.env[name]?.trim(),
);

export const liveAI: LiveAIConfig | null =
  missingLiveVariables.length > 0
    ? null
    : {
        provider: process.env.BS_LIVE_AI_PROVIDER?.trim() || DEFAULT_PROVIDER,
        baseUrl: (process.env.BS_LIVE_AI_BASE_URL ?? '').trim(),
        apiKey: (process.env.BS_LIVE_AI_API_KEY ?? '').trim(),
        model: (process.env.BS_LIVE_AI_MODEL ?? '').trim(),
      };

export const SKIP_REASON = `Live AI tests need ${missingLiveVariables.join(', ')}: set them in the environment or in apps/extension/${ENV_FILE_NAME} (tests/live/README.md).`;

const REDACTED = '[redacted]';

/** `text` with the API key replaced, for anything printed while live tests run. */
export function redactSecrets(text: string): string {
  const key = process.env.BS_LIVE_AI_API_KEY?.trim();
  return key ? text.split(key).join(REDACTED) : text;
}
