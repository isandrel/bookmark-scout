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
