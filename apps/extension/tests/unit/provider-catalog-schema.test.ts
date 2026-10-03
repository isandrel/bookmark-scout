import { describe, expect, it } from 'vitest';
import { aiProviderFileSchema } from '@/lib/config/ai-provider-schema';
import {
  catalogIdSchema,
  catalogProviderSchema,
  providerCatalogSchema,
} from '@/lib/config/provider-catalog-schema';
import providerCatalog from '../../config/provider-catalog.json';

const provider = {
  name: 'Example AI',
  base_url: 'https://api.example.com/v1',
  protocol: 'openai',
  requires_api_key: true,
};

describe('provider catalog schema', () => {
  it('accepts the committed models.dev snapshot', () => {
    expect(providerCatalogSchema.safeParse(providerCatalog).success).toBe(true);
  });

  it('rejects ids that are not safe file names', () => {
    for (const id of [
      '../../evil',
      'a/b',
      'a\\b',
      '..',
      'a..b',
      '.hidden',
      'UPPER',
      '',
      'x'.repeat(65),
    ]) {
      expect(catalogIdSchema.safeParse(id).success, id).toBe(false);
    }
    expect(catalogIdSchema.safeParse('alibaba-coding-plan.cn_2').success).toBe(true);
  });

  it('rejects a catalog whose provider or logo id could escape the logo folder', () => {
    const base = { source: 'test', logos: [], providers: {} };
    expect(providerCatalogSchema.safeParse({ ...base, logos: ['../x'] }).success).toBe(false);
    expect(
      providerCatalogSchema.safeParse({ ...base, providers: { '../x': provider } }).success,
    ).toBe(false);
  });

  it('allows plain HTTP only for servers on this machine', () => {
    const withUrl = (base_url: string) =>
      catalogProviderSchema.safeParse({ ...provider, base_url });
    expect(withUrl('http://localhost:1234/v1').success).toBe(true);
    expect(withUrl('http://api.example.com/v1').success).toBe(false);
    expect(withUrl('javascript:alert(1)').success).toBe(false);
    expect(withUrl('https://user:pass@api.example.com/v1').success).toBe(false);
  });

  it('rejects unknown fields and control characters in names', () => {
    expect(catalogProviderSchema.safeParse({ ...provider, extra: 1 }).success).toBe(false);
    expect(catalogProviderSchema.safeParse({ ...provider, name: 'a\u0000b' }).success).toBe(false);
  });
});

describe('provider file schema', () => {
  const file = {
    name: 'Example AI',
    order: 1,
    default_model: '',
    provider_kind: 'openai_compatible',
    requires_api_key: true,
  };
  const withPlaceholder = (api_key_placeholder: string) =>
    aiProviderFileSchema.safeParse({ ...file, api_key_placeholder }).success;

  it('takes a key format as the API key placeholder, never untranslated prose', () => {
    for (const format of ['sk-...', 'sk-or-...', 'gsk_...', 'AI...', '...']) {
      expect(withPlaceholder(format), format).toBe(true);
    }
    for (const prose of ['(Optional)', 'Required', 'Azure API key', 'Optional custom API key']) {
      expect(withPlaceholder(prose), prose).toBe(false);
    }
  });
});
