// Copy a Chromium build and grant its optional permissions at install, so a headless capture
// can run Refresh Site Icons and the popup's tab features without answering permission prompts.
// Usage: bun prepare-granted-build.ts <dist/chrome-mv3> <output dir>
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('Usage: bun prepare-granted-build.ts <build dir> <output dir>');

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

const manifestPath = path.join(target, 'manifest.json');
type Manifest = {
  permissions: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
};
const manifest = (await Bun.file(manifestPath).json()) as Manifest;
const granted = ['tabs', 'favicon'];
manifest.permissions = [...new Set([...manifest.permissions, ...granted])];
manifest.optional_permissions = manifest.optional_permissions?.filter((p) => !granted.includes(p));
manifest.host_permissions = manifest.optional_host_permissions ?? ['http://*/*', 'https://*/*'];
delete manifest.optional_host_permissions;
await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Granted build: ${target}`);
