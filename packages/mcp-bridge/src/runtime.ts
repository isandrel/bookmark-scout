/**
 * Where a native host listens and how `serve` finds it. Each browser profile's native host
 * listens on its own endpoint (a Unix socket, mode 0600, in a private 0700 folder; a named pipe on
 * Windows) and writes a discovery file next to it saying which browser and profile it serves.
 * Nothing listens on TCP.
 */
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { config } from "./config";
import { browserIdSchema, profileIdSchema } from "./protocol";

export const RUNTIME_DIR_ENV = "BOOKMARK_SCOUT_MCP_RUNTIME_DIR";

/** The longest Unix socket path macOS accepts (sun_path is 104 bytes with the terminator). */
const MAX_SOCKET_PATH = 103;

export type RuntimeEnvironment = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  uid: number;
  user: string;
  tmp: string;
};

export function currentEnvironment(): RuntimeEnvironment {
  const info = userInfo();
  return {
    platform: process.platform,
    env: process.env,
    uid: info.uid,
    user: info.username,
    tmp: tmpdir(),
  };
}

/** The folder holding endpoints and discovery files for this user. */
export function runtimeDir(environment: RuntimeEnvironment): string {
  const { env, platform } = environment;
  const override = env[RUNTIME_DIR_ENV];
  if (override) return override;
  const name = config.paths.runtime_dir_name;
  if (platform === "win32") {
    const base = env.LOCALAPPDATA ?? join(environment.tmp, "..");
    return join(base, config.paths.data_dir_name, "mcp", "run");
  }
  if (env.XDG_RUNTIME_DIR) return join(env.XDG_RUNTIME_DIR, name);
  return join(environment.tmp, `${name}-${environment.uid}`);
}

/**
 * Creates the runtime folder readable by this user only, or refuses one that someone else owns,
 * that is a link, or that others can open. On Windows the per-user profile folder's ACL applies.
 */
export function ensurePrivateDir(dir: string, environment: RuntimeEnvironment): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (environment.platform === "win32") return;
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${dir} is not a folder. Remove it and try again.`);
  }
  if (stat.uid !== environment.uid) {
    throw new Error(`${dir} belongs to another user. Remove it and try again.`);
  }
  if ((stat.mode & 0o077) !== 0) chmodSync(dir, 0o700);
}

export type Endpoint = { browser: string; profileId: string };

/** The socket path or pipe name a profile's native host listens on. */
export function endpointPath(
  dir: string,
  endpoint: Endpoint,
  environment: RuntimeEnvironment,
): string {
  const name = `${endpoint.browser}-${endpoint.profileId}`;
  if (environment.platform === "win32") {
    const user = environment.user.replace(/[^A-Za-z0-9._-]/g, "_");
    return `\\\\.\\pipe\\${config.paths.runtime_dir_name}-${user}-${name}`;
  }
  const path = join(dir, `${name}.sock`);
  if (Buffer.byteLength(path) > MAX_SOCKET_PATH) {
    throw new Error(
      `The socket path ${path} is too long for this system. Set ${RUNTIME_DIR_ENV} to a shorter folder.`,
    );
  }
  return path;
}

export const discoveryEntrySchema = z.object({
  protocol: z.number().int(),
  browser: browserIdSchema,
  profileId: profileIdSchema,
  extensionVersion: z.string(),
  endpoint: z.string().min(1),
  pid: z.number().int().positive(),
  startedAt: z.string(),
});
export type DiscoveryEntry = z.infer<typeof discoveryEntrySchema>;

function discoveryPath(dir: string, endpoint: Endpoint): string {
  return join(dir, `${endpoint.browser}-${endpoint.profileId}.json`);
}

/** Writes a discovery file readable by this user only, replacing any older one at once. */
export function writeDiscovery(dir: string, entry: DiscoveryEntry): void {
  const path = discoveryPath(dir, entry);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/**
 * Removes a discovery file if it is still this process's, and says whether it was. A newer host
 * for the same profile (the browser reconnected) owns the file and endpoint otherwise.
 */
export function removeDiscovery(dir: string, endpoint: Endpoint, pid: number): boolean {
  const path = discoveryPath(dir, endpoint);
  if (readEntry(path)?.pid !== pid) return false;
  rmSync(path, { force: true });
  return true;
}

function readEntry(path: string): DiscoveryEntry | undefined {
  try {
    const parsed = discoveryEntrySchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Every live native host, newest first. Files left by hosts that died are skipped. */
export function listDiscovery(dir: string): DiscoveryEntry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readEntry(join(dir, name)))
    .filter((entry): entry is DiscoveryEntry => entry !== undefined && isProcessAlive(entry.pid))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export type Selection = { browser?: string; profile?: string };

/**
 * The native host `serve` should use: the newest one matching the browser and profile asked for.
 * A profile matches by its id or a prefix of it.
 */
export function selectDiscovery(
  entries: readonly DiscoveryEntry[],
  selection: Selection,
): DiscoveryEntry | undefined {
  return entries.find(
    (entry) =>
      (!selection.browser || entry.browser === selection.browser) &&
      (!selection.profile || entry.profileId.startsWith(selection.profile)),
  );
}
