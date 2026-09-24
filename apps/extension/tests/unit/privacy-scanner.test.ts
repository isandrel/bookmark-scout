import { describe, expect, it } from 'vitest';
import { scanBookmarkPrivacy } from '@/services/bookmark-network-tools';

const options = {
  scanTitles: false,
  scanQueryParams: true,
  scanFragments: true,
  sensitiveParams: ['token', 'api_key', 'password'],
  emailDetection: true,
  uuidDetection: true,
};

function scan(url: string) {
  const { items } = scanBookmarkPrivacy(
    [{ id: 'root', title: 'F', children: [{ id: '1', title: 'B', url }] }],
    options,
  );
  return items[0]
    ? { severity: items[0].severity, kinds: items[0].findings.map((f) => f.kind) }
    : null;
}

// Synthetic, obviously fake token shapes.
const FAKE_GITHUB = `ghp_${'a'.repeat(36)}`;
const FAKE_OPENAI = `sk-${'b'.repeat(40)}`;
const FAKE_SLACK = `xoxb-${'1'.repeat(12)}-fake`;

describe('privacy scanner', () => {
  it('flags user:password credentials as high and not as an email', () => {
    expect(scan('https://user:hunter2@example.com/app')).toEqual({
      severity: 'high',
      kinds: ['credentials'],
    });
    expect(scan('https://user@example.com/app')).toEqual({
      severity: 'medium',
      kinds: ['credentials'],
    });
  });

  it('flags tokens in fragments, including SPA routes, as high', () => {
    expect(scan('https://app.example.com/cb#access_token=abc&state=1')).toEqual({
      severity: 'high',
      kinds: ['sensitiveFragmentParam'],
    });
    expect(scan('https://app.example.com/#/cb?id_token=abc')?.severity).toBe('high');
  });

  it('recognizes common token formats in query values', () => {
    for (const token of [FAKE_GITHUB, `github_pat_${'c'.repeat(30)}`, FAKE_OPENAI, FAKE_SLACK]) {
      expect(scan(`https://example.com/x?q=${token}`)).toEqual({
        severity: 'high',
        kinds: ['tokenPattern'],
      });
    }
  });

  it('uses low severity for weak signals and ignores SPA routes and asset names', () => {
    expect(scan('https://example.com/docs#section')).toEqual({
      severity: 'low',
      kinds: ['fragment'],
    });
    expect(scan('https://example.com/#/settings/profile')).toBeNull();
    expect(scan('https://example.com/img/logo@2x.png')).toBeNull();
    expect(scan('https://example.com/u/123e4567-e89b-12d3-a456-426614174000')).toEqual({
      severity: 'low',
      kinds: ['uuid'],
    });
  });

  it('keeps emails medium and sensitive query params high', () => {
    expect(scan('https://example.com/?to=jane%40example.org')).toEqual({
      severity: 'medium',
      kinds: ['email'],
    });
    expect(scan('https://example.com/?api_key=1')).toEqual({
      severity: 'high',
      kinds: ['sensitiveParam'],
    });
  });
});
