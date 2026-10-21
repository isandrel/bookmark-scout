/**
 * Whether an address is on a private network, from config/network/private-networks.toml.
 * Pure: host names are matched by the caller (`services/page-reader.ts`).
 */
import { z } from 'zod';

/** IPv4's shape: four decimal octets of 0 to 255, 32 bits in all. */
const IPV4_OCTETS = 4;
const IPV4_OCTET_VALUES = BYTE_MAX + 1;
const IPV4_BITS = 32;
const IPV4_OCTET = /^\d{1,3}$/;
const CIDR_SEPARATOR = '/';
const IPV4_SEPARATOR = '.';
/** An IPv4 address written inside IPv6 (`::ffff:10.0.0.1`). */
const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;
const IPV6_SEPARATOR = ':';
const IPV6_BRACKETS = /^\[|\]$/g;

const config = readConfig(
  'network/private-networks',
  z.strictObject({
    ipv4: z.array(z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/)).min(1),
    ipv6_addresses: z.array(z.string().min(1)),
    ipv6_prefixes: z.array(z.string().regex(/^[0-9a-f]+$/)),
  }),
);

/** The address as a 32-bit number, or undefined when `host` is no IPv4 address. */
function parseIPv4(host: string): number | undefined {
  const parts = host.split(IPV4_SEPARATOR);
  if (parts.length !== IPV4_OCTETS || !parts.every((part) => IPV4_OCTET.test(part))) {
    return undefined;
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet >= IPV4_OCTET_VALUES)) return undefined;
  return octets.reduce((value, octet) => value * IPV4_OCTET_VALUES + octet, 0);
}

const PRIVATE_IPV4_RANGES = config.ipv4.map((cidr) => {
  const [address, bits] = cidr.split(CIDR_SEPARATOR);
  const base = address === undefined ? undefined : parseIPv4(address);
  const prefix = Number(bits);
  if (base === undefined || prefix > IPV4_BITS) throw new Error(`Invalid IPv4 range: ${cidr}`);
  return { base, size: 2 ** (IPV4_BITS - prefix) };
});

export function isPrivateIPv4(host: string): boolean {
  const address = parseIPv4(host);
  if (address === undefined) return false;
  return PRIVATE_IPV4_RANGES.some(
    ({ base, size }) => Math.floor(address / size) === Math.floor(base / size),
  );
}

export function isPrivateIPv6(host: string): boolean {
  const address = host.replace(IPV6_BRACKETS, '').toLowerCase();
  if (!address.includes(IPV6_SEPARATOR)) return false;
  if (config.ipv6_addresses.includes(address)) return true;
  // An IPv4-mapped address inherits the IPv4 answer.
  const mapped = address.match(IPV4_MAPPED);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return config.ipv6_prefixes.some((prefix) => address.startsWith(prefix));
}
