import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RichMessage } from '@/components/ui/rich-message';
import { setLanguage } from '@/hooks/use-i18n';

beforeAll(() => setLanguage('en'));
afterAll(() => setLanguage('auto'));

describe('RichMessage', () => {
  it('puts each element where the translation has its placeholder', () => {
    const html = renderToStaticMarkup(
      <RichMessage messageKey="tools_deadLinkRedirectsTo" values={[<b key="link">target</b>]} />,
    );
    expect(html).toBe('Redirects to <b>target</b>');

    setLanguage('ja');
    const ja = renderToStaticMarkup(
      <RichMessage messageKey="tools_deadLinkRedirectsTo" values={[<b key="link">target</b>]} />,
    );
    expect(ja).toContain('<b>target</b>');
    expect(ja).not.toContain('');
    setLanguage('en');
  });
});
