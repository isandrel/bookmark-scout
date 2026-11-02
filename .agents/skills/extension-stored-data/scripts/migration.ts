/**
 * Adds or removes a storage migration in one step: its module
 * (`apps/extension/src/lib/storage/migrations/<id>.ts`), its table in
 * `apps/extension/config/data/migrations.toml`, and its test
 * (`apps/extension/tests/unit/migrations/<id>.test.ts`).
 *
 *   bun .agents/skills/extension-stored-data/scripts/migration.ts add <name>
 *   bun .agents/skills/extension-stored-data/scripts/migration.ts remove <id>
 *
 * `add` names the migration `<yyyy-mm>-<name>` by today's date, adds it in the next patch release
 * of `package.json`'s version, and keeps it `[defaults] keep_minor_releases` minor releases.
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

const root = path.resolve(import.meta.dir, "../../../..");
const app = path.join(root, "apps/extension");
const configPath = path.join(app, "config/data/migrations.toml");
const moduleOf = (id: string) => path.join(app, "src/lib/storage/migrations", `${id}.ts`);
const testOf = (id: string) => path.join(app, "tests/unit/migrations", `${id}.test.ts`);

const [command, arg] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function add(name: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
    fail("The name is kebab-case: lowercase words and hyphens.");
  const now = new Date();
  const id = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${name}`;
  if (existsSync(moduleOf(id))) fail(`${id} exists already.`);
  const config = parse(await Bun.file(configPath).text()) as {
    defaults: { keep_minor_releases: number };
  };
  const version = (
    JSON.parse(await Bun.file(path.join(app, "package.json")).text()) as { version: string }
  ).version;
  const [major, minor, patch] = version.split(".").map(Number);
  const addedIn = `${major}.${minor}.${patch + 1}`;
  const removeAfter = `${major}.${minor + config.defaults.keep_minor_releases}.0`;

  await Bun.write(
    moduleOf(id),
    `/**
 * TODO: what moves, from where (the release that stored it there) to where this release keeps it.
 */
import type { MigrationModule } from './index';

export const migration: MigrationModule = {
  description: 'TODO: what it moves, from where to where',
  recover(layers) {
    // TODO: return the old values by setting key; each fills its scope where that holds none.
    return { found: {} };
  },
};
`,
  );
  await Bun.write(
    testOf(id),
    `/**
 * TODO: what the migration moves (\`src/lib/storage/migrations/${id}.ts\`); deleted with it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { runStorageMigrations } from '@/lib/settings-storage';
import { getMigration } from '@/lib/storage/migrations';

const migration = getMigration('${id}');

beforeEach(() => {
  fakeBrowser.reset();
});

describe('${id}', () => {
  it.todo('moves the old value where this release keeps it');

  it('runs on a device with nothing to move', async () => {
    await runStorageMigrations();
    expect(migration.id).toBe('${id}');
  });
});
`,
  );
  const table = `\n[migrations."${id}"]\nenabled = true\nadded_in = "${addedIn}"\nremove_after = "${removeAfter}"\n`;
  await Bun.write(configPath, `${(await Bun.file(configPath).text()).trimEnd()}\n${table}`);
  console.log(`Added ${id} (added_in ${addedIn}, remove_after ${removeAfter}):`);
  for (const file of [moduleOf(id), testOf(id), configPath])
    console.log(`  ${path.relative(root, file)}`);
}

async function remove(id: string) {
  const text = await Bun.file(configPath).text();
  const header = `[migrations."${id}"]`;
  const start = text.indexOf(header);
  if (start === -1 && !existsSync(moduleOf(id))) fail(`There is no migration ${id}.`);
  if (start !== -1) {
    const next = text.indexOf("\n[", start + header.length);
    const end = next === -1 ? text.length : next + 1;
    await Bun.write(configPath, `${(text.slice(0, start) + text.slice(end)).trimEnd()}\n`);
  }
  for (const file of [moduleOf(id), testOf(id)]) rmSync(file, { force: true });
  console.log(`Removed ${id}: its module, its test, and its table in config/data/migrations.toml.`);
  console.log("Check that no other test still names it (rg the id), then run the unit tests.");
}

if (command === "add" && arg) await add(arg);
else if (command === "remove" && arg) await remove(arg);
else fail("Usage: migration.ts add <name> | remove <id>");
