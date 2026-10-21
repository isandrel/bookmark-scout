import { describe, expect, it } from 'vitest';
import { boundedNumber } from '@/lib/config/bounded';
import {
  HTTP_STATUS,
  httpStatusClass,
  httpStatusCodeSchema,
  isHttpErrorStatus,
  isNullBodyStatus,
} from '@/lib/http-status';
import { isPrivateIPv4, isPrivateIPv6 } from '@/lib/private-network';
import { readConfigToml } from '../config-files';

describe('bounded config numbers', () => {
  const schema = boundedNumber({ integer: true });

  it('give the value, with its bounds written beside it', () => {
    expect(schema.parse({ value: 3, min: 0, max: 8 })).toBe(3);
  });

  it('refuse a value outside its bounds, bounds in the wrong order, or a fraction', () => {
    expect(schema.safeParse({ value: 9, min: 0, max: 8 }).success).toBe(false);
    expect(schema.safeParse({ value: 3, min: 8, max: 0 }).success).toBe(false);
    expect(schema.safeParse({ value: 2.5, min: 0, max: 8 }).success).toBe(false);
    expect(schema.safeParse({ value: 3, min: 0, max: 8, step: 1 }).success).toBe(false);
  });
});

describe('HTTP statuses from config/network/http.toml', () => {
  const http = readConfigToml('network/http.toml') as {
    status_min: number;
    status_max: number;
    error_min: number;
    null_body: number[];
  };

  it('tell errors, classes, and bodiless responses apart', () => {
    expect(isHttpErrorStatus(http.error_min)).toBe(true);
    expect(isHttpErrorStatus(http.error_min - 1)).toBe(false);
    expect(httpStatusClass(HTTP_STATUS.forbidden)).toBe('4xx');
    for (const status of http.null_body) expect(isNullBodyStatus(status)).toBe(true);
    expect(httpStatusCodeSchema.safeParse(http.status_max + 1).success).toBe(false);
    expect(httpStatusCodeSchema.safeParse(http.status_min).success).toBe(true);
  });
});

describe('private networks from config/network/private-networks.toml', () => {
  it('match every configured IPv4 range at its edges, and nothing public', () => {
    expect(isPrivateIPv4('10.255.255.255')).toBe(true);
    expect(isPrivateIPv4('172.31.0.1')).toBe(true);
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    expect(isPrivateIPv4('100.64.0.1')).toBe(true);
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('256.1.1.1')).toBe(false);
  });

  it('match IPv6 loopback, local prefixes, and mapped private IPv4', () => {
    expect(isPrivateIPv6('[::1]')).toBe(true);
    expect(isPrivateIPv6('fd12::1')).toBe(true);
    expect(isPrivateIPv6('fe80::1')).toBe(true);
    expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIPv6('2001:db8::1')).toBe(false);
  });
});

describe('shared helpers that replaced inline numbers', () => {
  it('round, and spell a host with and without www.', async () => {
    const { roundTo } = await import('@/lib/units');
    const { otherWwwHost, withoutWww } = await import('@/lib/url-domain');
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(withoutWww('www.example.com')).toBe('example.com');
    expect(withoutWww('wwwexample.com')).toBe('wwwexample.com');
    expect(otherWwwHost('example.com')).toBe('www.example.com');
    expect(otherWwwHost('www.example.com')).toBe('example.com');
  });

  it('place a pointer on a row, and count an unmeasured row or a stray pointer as configured', async () => {
    const { rowFraction } = await import('@/lib/bookmark-drop');
    const { unmeasured_fraction: unmeasured } = readConfigToml('ui/drag-drop.toml') as {
      unmeasured_fraction: number;
    };
    expect(rowFraction(25, { top: 0, height: 100 })).toBe(0.25);
    expect(rowFraction(25, { top: 0, height: 0 })).toBe(unmeasured);
    expect(rowFraction(250, { top: 0, height: 100 })).toBe(unmeasured);
    expect(rowFraction(25, undefined)).toBe(unmeasured);
  });

  it('offer the configured choices for the icon size and the result count', async () => {
    const { getSettingsFieldMeta, settingsSchema } = await import('@/lib/settings-schema');
    const appearance = readConfigToml('settings/appearance.toml') as {
      theme_icons: { favicon_size: { options: { value: number }[] } };
    };
    const sizes = appearance.theme_icons.favicon_size.options.map((option) => option.value);
    const meta = getSettingsFieldMeta().faviconSize;
    expect(meta.options?.map((option) => option.value)).toEqual(sizes);
    expect(settingsSchema.shape.faviconSize.safeParse(sizes[0]).success).toBe(true);
    expect(settingsSchema.shape.faviconSize.safeParse(Math.max(...sizes) + 1).success).toBe(false);
  });
});
