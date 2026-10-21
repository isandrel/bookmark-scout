/**
 * "Check this computer" for Chrome's built-in AI: what the browser itself can tell about Chrome's
 * requirements for the model (`[requirements]` in config/ai/built-in.toml), so nobody needs
 * DevTools to find out why the model is unavailable. Measured: the Chrome version and the operating
 * system (client hints, else the user agent), processor cores (`hardwareConcurrency`), and memory
 * (`deviceMemory`, which Chrome caps, so a value at the cap is "that much or more", never a pass or
 * a fail). Free disk space and graphics memory are invisible to web pages, so those rows only
 * state the requirement. Nothing here leaves the computer.
 */

/** How a row compares with the requirement. `warn` is measured but maybe not enough. */
export type BuiltinAICheckState = 'pass' | 'fail' | 'warn' | 'unknown';

export type BuiltinAICheckId = 'browser' | 'os' | 'memory' | 'cores' | 'disk' | 'gpu';

/** What the browser reported about this computer; a missing field means it reported nothing. */
export type BuiltinAIDevice = {
  /** Chrome's brand as reported ("Google Chrome") and its version ("141.0.7390.54"). */
  browser?: { brand: string; version: string; major: number };
  os?: { platform: OSPlatform; version?: string };
  cores?: number;
  /** `navigator.deviceMemory`, in GB. */
  memoryGb?: number;
};

export type OSPlatform = 'macos' | 'windows' | 'linux' | 'chromeos' | 'other';

export type BuiltinAICheck = {
  id: BuiltinAICheckId;
  state: BuiltinAICheckState;
  /** The measured value in words ("Google Chrome 141.0", "macOS 15.6", "8"), when there is one. */
  measured?: string;
};

type Brand = { brand: string; version: string };
type HighEntropyValues = { fullVersionList?: Brand[]; platform?: string; platformVersion?: string };
type UserAgentData = {
  brands?: Brand[];
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyValues>;
};

/** The parts of `navigator` the check reads; tests pass their own. */
export type DeviceNavigator = {
  userAgent?: string;
  userAgentData?: UserAgentData;
  hardwareConcurrency?: number;
  deviceMemory?: number;
};

/** Windows 11 reports a platformVersion major of 13 or more (Microsoft's client hint mapping). */
const WINDOWS_11_PLATFORM_VERSION = 13;

/** Whether this build shows the check (Chrome; Edge names its switch differently). */
export function canCheckBuiltinAIDevice(): boolean {
  const browsers: readonly SupportedBrowser[] = builtinAIConfig.check.browsers;
  return browsers.includes(currentBrowser());
}

function majorOf(version: string | undefined): number | undefined {
  const major = Number.parseInt(version ?? '', 10);
  return Number.isFinite(major) ? major : undefined;
}

function platformOf(name: string): OSPlatform {
  const lower = name.toLowerCase();
  if (/mac/.test(lower)) return 'macos';
  if (/^win/.test(lower)) return 'windows';
  if (/chrome ?os|cros/.test(lower)) return 'chromeos';
  if (/linux|x11/.test(lower)) return 'linux';
  return 'other';
}

/** The platform from a user agent string, for browsers without client hints. */
function platformFromUserAgent(userAgent: string): string | undefined {
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Android|iPhone|iPad/.test(userAgent)) return undefined;
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Linux|X11/.test(userAgent)) return 'Linux';
  return undefined;
}

function chromeBrand(brands: readonly Brand[] | undefined): Brand | undefined {
  for (const name of builtinAIConfig.check.brands) {
    const found = brands?.find((entry) => entry.brand === name);
    if (found) return found;
  }
  return undefined;
}

/**
 * Reads what the browser tells about this computer: the full Chrome version and the OS version from
 * client hints where it has them (Chrome), else the user agent (whose macOS version is frozen, so
 * it is not used), plus processor cores and memory.
 */
export async function readBuiltinAIDevice(
  nav: DeviceNavigator | undefined = globalThis.navigator as DeviceNavigator | undefined,
): Promise<BuiltinAIDevice> {
  const userAgent = nav?.userAgent ?? '';
  let hints: HighEntropyValues = {};
  try {
    hints =
      (await nav?.userAgentData?.getHighEntropyValues?.(['fullVersionList', 'platformVersion'])) ??
      {};
  } catch {
    hints = {};
  }

  const device: BuiltinAIDevice = {};
  const brand = chromeBrand(hints.fullVersionList) ?? chromeBrand(nav?.userAgentData?.brands);
  const fromUserAgent = /(?:Chrome|Chromium)\/(\d+[\d.]*)/.exec(userAgent)?.[1];
  const version = brand?.version ?? fromUserAgent;
  const major = majorOf(version);
  if (version && major !== undefined) {
    device.browser = { brand: brand?.brand ?? 'Chrome', version, major };
  }

  const platformName =
    hints.platform || nav?.userAgentData?.platform || platformFromUserAgent(userAgent);
  if (platformName) {
    device.os = { platform: platformOf(platformName) };
    // Only client hints carry a real OS version; an empty string means "not reported".
    if (hints.platformVersion) device.os.version = hints.platformVersion;
  }

  const cores = nav?.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0) device.cores = cores;
  const memory = nav?.deviceMemory;
  if (typeof memory === 'number' && memory > 0) device.memoryGb = memory;
  return device;
}

/** "macOS 15.6", "Windows 11", "Linux", "ChromeOS", or undefined for an unknown platform. */
function osName(os: NonNullable<BuiltinAIDevice['os']>): string | undefined {
  switch (os.platform) {
    case 'macos':
      return os.version ? `macOS ${os.version}` : 'macOS';
    case 'windows': {
      const major = majorOf(os.version);
      if (major === undefined || major < builtinAIConfig.requirements.windows_platform_version) {
        return 'Windows';
      }
      return major >= WINDOWS_11_PLATFORM_VERSION ? 'Windows 11' : 'Windows 10';
    }
    case 'linux':
      return 'Linux';
    case 'chromeos':
      return 'ChromeOS';
    default:
      return undefined;
  }
}

function checkOS(os: BuiltinAIDevice['os']): BuiltinAICheck {
  const needs = builtinAIConfig.requirements;
  if (!os) return { id: 'os', state: 'unknown' };
  const measured = osName(os);
  const major = majorOf(os.version);
  switch (os.platform) {
    case 'macos':
      if (major === undefined) return { id: 'os', state: 'unknown', measured };
      return { id: 'os', state: major >= needs.macos_version ? 'pass' : 'fail', measured };
    case 'windows':
      if (major === undefined) return { id: 'os', state: 'unknown', measured };
      return {
        id: 'os',
        state: major >= needs.windows_platform_version ? 'pass' : 'fail',
        measured,
      };
    case 'linux':
      return { id: 'os', state: 'pass', measured };
    // Chrome runs the model only on a Chromebook Plus, which a web page cannot tell apart.
    case 'chromeos':
      return { id: 'os', state: 'unknown', measured };
    default:
      return { id: 'os', state: 'unknown' };
  }
}

function checkMemory(memoryGb: number | undefined): BuiltinAICheck {
  const needs = builtinAIConfig.requirements;
  if (memoryGb === undefined) return { id: 'memory', state: 'unknown' };
  const measured = String(memoryGb);
  if (memoryGb >= needs.ram_gb) return { id: 'memory', state: 'pass', measured };
  // At the cap the real amount may be anything above it: neither a pass nor a fail.
  if (memoryGb >= builtinAIConfig.check.reported_memory_cap_gb) {
    return { id: 'memory', state: 'unknown', measured };
  }
  return { id: 'memory', state: 'warn', measured };
}

/**
 * Each requirement against what the browser reported. Cores and memory below the requirement
 * are only a warning: a graphics card with enough memory, which no page can see, is enough alone.
 */
export function checkBuiltinAIDevice(device: BuiltinAIDevice): BuiltinAICheck[] {
  const needs = builtinAIConfig.requirements;
  const { browser } = device;
  return [
    browser
      ? {
          id: 'browser',
          state: browser.major >= needs.chrome_version ? 'pass' : 'fail',
          measured: `${browser.brand} ${browser.version}`,
        }
      : { id: 'browser', state: 'unknown' },
    checkOS(device.os),
    checkMemory(device.memoryGb),
    device.cores === undefined
      ? { id: 'cores', state: 'unknown' }
      : {
          id: 'cores',
          state: device.cores >= needs.cpu_cores ? 'pass' : 'warn',
          measured: String(device.cores),
        },
    { id: 'disk', state: 'unknown' },
    { id: 'gpu', state: 'unknown' },
  ];
}

/** Whether a row rules the computer out, so the switch that skips the hardware check cannot help. */
export function builtinAICheckFails(checks: readonly BuiltinAICheck[]): boolean {
  return checks.some((check) => check.state === 'fail');
}

/** The Chrome version when it is older than the model needs (the reason for no API), else undefined. */
export function builtinAIOutdatedChrome(device: BuiltinAIDevice): string | undefined {
  const { browser } = device;
  if (!browser || browser.major >= builtinAIConfig.requirements.chrome_version) return undefined;
  return `${browser.brand} ${browser.version}`;
}

/** Opens one of Chrome's own pages (flags, on-device internals) in a new tab. */
export async function openBuiltinAIBrowserPage(url: string): Promise<void> {
  await browser.tabs.create({ url, active: true });
}
