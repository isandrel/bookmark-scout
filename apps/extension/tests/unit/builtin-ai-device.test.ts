/**
 * "Check this computer" for Chrome's built-in AI: reading the Chrome version, the operating system,
 * cores, and memory from a mocked `navigator` (client hints, else the user agent), and comparing
 * them with the requirements in config/ai/built-in.toml, including what stays unknown.
 */
import { describe, expect, it } from 'vitest';
import { builtinAIConfig } from '@/services/builtin-ai';
import {
  type BuiltinAICheck,
  type BuiltinAIDevice,
  builtinAICheckFails,
  builtinAIOutdatedChrome,
  canCheckBuiltinAIDevice,
  checkBuiltinAIDevice,
  type DeviceNavigator,
  readBuiltinAIDevice,
} from '@/services/builtin-ai-device';
import { readConfigToml } from '../config-files';

const needs = builtinAIConfig.requirements;
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0';

/** A Chrome `navigator` with client hints. */
function chromeNavigator({
  version = '141.0.7390.54',
  platform = 'macOS',
  platformVersion = '15.6.1',
  cores = 10,
  memory = 8,
}: {
  version?: string;
  platform?: string;
  platformVersion?: string;
  cores?: number;
  memory?: number;
} = {}): DeviceNavigator {
  const brands = [
    { brand: 'Not)A;Brand', version: '8.0.0.0' },
    { brand: 'Chromium', version },
    { brand: 'Google Chrome', version },
  ];
  return {
    userAgent: MAC_UA,
    hardwareConcurrency: cores,
    deviceMemory: memory,
    userAgentData: {
      brands: brands.map(({ brand, version: full }) => ({ brand, version: full.split('.')[0] })),
      platform,
      getHighEntropyValues: async () => ({ fullVersionList: brands, platform, platformVersion }),
    },
  };
}

function rowOf(checks: BuiltinAICheck[], id: BuiltinAICheck['id']): BuiltinAICheck | undefined {
  return checks.find((check) => check.id === id);
}

function check(device: BuiltinAIDevice, id: BuiltinAICheck['id']): BuiltinAICheck | undefined {
  return rowOf(checkBuiltinAIDevice(device), id);
}

describe('readBuiltinAIDevice', () => {
  it('reads the full Chrome version and the OS version from client hints', async () => {
    await expect(readBuiltinAIDevice(chromeNavigator())).resolves.toEqual({
      browser: { brand: 'Google Chrome', version: '141.0.7390.54', major: 141 },
      os: { platform: 'macos', version: '15.6.1' },
      cores: 10,
      memoryGb: 8,
    });
  });

  it('falls back to the user agent without client hints, and never trusts its frozen OS version', async () => {
    await expect(readBuiltinAIDevice({ userAgent: WINDOWS_UA })).resolves.toEqual({
      browser: { brand: 'Chrome', version: '137.0.0.0', major: 137 },
      os: { platform: 'windows' },
    });
    const failing = chromeNavigator();
    failing.userAgentData = {
      ...failing.userAgentData,
      getHighEntropyValues: () => Promise.reject(new Error('blocked')),
    };
    const device = await readBuiltinAIDevice(failing);
    // The low-entropy brands still give the major version; the OS version stays unknown.
    expect(device.browser).toEqual({ brand: 'Google Chrome', version: '141', major: 141 });
    expect(device.os).toEqual({ platform: 'macos' });
  });

  it('reports nothing it cannot read (Firefox, no navigator)', async () => {
    await expect(readBuiltinAIDevice({ userAgent: FIREFOX_UA })).resolves.toEqual({
      os: { platform: 'linux' },
    });
    await expect(readBuiltinAIDevice({})).resolves.toEqual({});
  });
});

describe('checkBuiltinAIDevice', () => {
  it('takes every threshold from config/ai/built-in.toml', () => {
    const file = readConfigToml('ai/built-in.toml') as {
      requirements: Record<string, number>;
      check: Record<string, unknown>;
    };
    expect(file.requirements.chrome_version).toBe(needs.chrome_version);
    expect(file.requirements.macos_version).toBe(needs.macos_version);
    expect(file.requirements.cpu_cores).toBe(needs.cpu_cores);
    expect(file.check.flag_url).toBe('chrome://flags/#optimization-guide-on-device-model');
    expect(file.check.internals_url).toBe('chrome://on-device-internals');
  });

  it('passes the Chrome version at the minimum and fails it below', () => {
    const at = (major: number): BuiltinAIDevice => ({
      browser: { brand: 'Google Chrome', version: `${major}.0.1.2`, major },
    });
    expect(check(at(needs.chrome_version), 'browser')).toEqual({
      id: 'browser',
      state: 'pass',
      measured: `Google Chrome ${needs.chrome_version}.0.1.2`,
    });
    expect(check(at(needs.chrome_version - 1), 'browser')?.state).toBe('fail');
    expect(check({}, 'browser')).toEqual({ id: 'browser', state: 'unknown' });
  });

  it('checks the operating system and its version where the browser reports one', () => {
    const os = (platform: NonNullable<BuiltinAIDevice['os']>['platform'], version?: string) =>
      check({ os: { platform, version } }, 'os');
    expect(os('macos', `${needs.macos_version}.0.0`)).toEqual({
      id: 'os',
      state: 'pass',
      measured: `macOS ${needs.macos_version}.0.0`,
    });
    expect(os('macos', `${needs.macos_version - 1}.7.1`)?.state).toBe('fail');
    expect(os('macos')).toEqual({ id: 'os', state: 'unknown', measured: 'macOS' });
    // Client hints number Windows releases: 1 to 10 are Windows 10, 13 and up Windows 11.
    expect(os('windows', '15.0.0')).toEqual({ id: 'os', state: 'pass', measured: 'Windows 11' });
    expect(os('windows', '10.0.0')).toEqual({ id: 'os', state: 'pass', measured: 'Windows 10' });
    expect(os('windows', '0.3.0')).toEqual({ id: 'os', state: 'fail', measured: 'Windows' });
    expect(os('windows')?.state).toBe('unknown');
    expect(os('linux')).toEqual({ id: 'os', state: 'pass', measured: 'Linux' });
    // Only a Chromebook Plus runs the model, which no page can tell apart.
    expect(os('chromeos')).toEqual({ id: 'os', state: 'unknown', measured: 'ChromeOS' });
    expect(os('other')).toEqual({ id: 'os', state: 'unknown' });
    expect(check({}, 'os')).toEqual({ id: 'os', state: 'unknown' });
  });

  it('never passes or fails memory at the reported cap, and warns below it', () => {
    const cap = builtinAIConfig.check.reported_memory_cap_gb;
    expect(check({ memoryGb: cap }, 'memory')).toEqual({
      id: 'memory',
      state: 'unknown',
      measured: String(cap),
    });
    expect(check({ memoryGb: cap / 2 }, 'memory')?.state).toBe('warn');
    // Should Chrome ever report more, a real measurement at or above the need passes.
    expect(check({ memoryGb: needs.ram_gb }, 'memory')?.state).toBe('pass');
    expect(check({}, 'memory')).toEqual({ id: 'memory', state: 'unknown' });
  });

  it('passes cores at the minimum and only warns below it (a graphics card is enough alone)', () => {
    expect(check({ cores: needs.cpu_cores }, 'cores')).toEqual({
      id: 'cores',
      state: 'pass',
      measured: String(needs.cpu_cores),
    });
    expect(check({ cores: needs.cpu_cores - 1 }, 'cores')?.state).toBe('warn');
    expect(check({}, 'cores')?.state).toBe('unknown');
  });

  it('states free disk space and graphics memory without a measurement', () => {
    const checks = checkBuiltinAIDevice({ cores: 64, memoryGb: 64 });
    expect(rowOf(checks, 'disk')).toEqual({ id: 'disk', state: 'unknown' });
    expect(rowOf(checks, 'gpu')).toEqual({ id: 'gpu', state: 'unknown' });
    expect(checks.map((row) => row.id)).toEqual([
      'browser',
      'os',
      'memory',
      'cores',
      'disk',
      'gpu',
    ]);
  });

  it('rules the computer out only on a failed row', async () => {
    const good = checkBuiltinAIDevice(await readBuiltinAIDevice(chromeNavigator({ cores: 2 })));
    expect(builtinAICheckFails(good)).toBe(false);
    const oldMac = checkBuiltinAIDevice(
      await readBuiltinAIDevice(chromeNavigator({ platformVersion: '12.7.0' })),
    );
    expect(builtinAICheckFails(oldMac)).toBe(true);
  });
});

describe('builtinAIOutdatedChrome', () => {
  it('names this Chrome only when it is older than the model needs', async () => {
    const old = await readBuiltinAIDevice(chromeNavigator({ version: '137.0.7151.68' }));
    expect(builtinAIOutdatedChrome(old)).toBe('Google Chrome 137.0.7151.68');
    expect(builtinAIOutdatedChrome(await readBuiltinAIDevice(chromeNavigator()))).toBeUndefined();
    // Firefox reports no Chrome version: its missing API is not about the version.
    expect(
      builtinAIOutdatedChrome(await readBuiltinAIDevice({ userAgent: FIREFOX_UA })),
    ).toBeUndefined();
  });
});

describe('canCheckBuiltinAIDevice', () => {
  it('shows the check in the builds the config lists', () => {
    expect(builtinAIConfig.check.browsers).toContain('chrome');
    expect(canCheckBuiltinAIDevice()).toBe(
      (builtinAIConfig.check.browsers as readonly string[]).includes(import.meta.env.BROWSER),
    );
  });
});
