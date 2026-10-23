import { ExternalLink } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK_TARGET_ICONS, LinkTargetIcon, UrlLink } from '@/components/ui/url-link';
import { setLanguage } from '@/hooks/use-i18n';
import { type LinkOpenTarget, linkOpenTargetSchema } from '@/lib/settings-schema';

const settings: { linkOpenTarget: LinkOpenTarget; showLinkTarget: boolean } = {
  linkOpenTarget: 'new_tab',
  showLinkTarget: true,
};

vi.mock('@/hooks/use-settings', () => ({
  useSetting: (key: keyof typeof settings) => ({ value: settings[key] }),
}));

beforeAll(() => setLanguage('en'));
afterAll(() => setLanguage('auto'));

beforeEach(() => {
  settings.linkOpenTarget = 'new_tab';
  settings.showLinkTarget = true;
});

describe('LINK_TARGET_ICONS', () => {
  it('has one icon and label per Open links in choice, each different', () => {
    const targets = linkOpenTargetSchema.options;
    expect(Object.keys(LINK_TARGET_ICONS).sort()).toEqual([...targets].sort());
    const entries = targets.map((target) => LINK_TARGET_ICONS[target]);
    expect(new Set(entries.map((entry) => entry.icon)).size).toBe(targets.length);
    expect(new Set(entries.map((entry) => entry.labelKey)).size).toBe(targets.length);
    expect(LINK_TARGET_ICONS.new_tab.icon).toBe(ExternalLink);
  });
});

describe('LinkTargetIcon', () => {
  it.each([
    ['new_tab', 'Opens in a new tab'],
    ['background_tab', 'Opens in a background tab'],
    ['current_tab', 'Opens in this tab'],
  ] as const)('shows where %s opens, in a tooltip and for screen readers', (target, words) => {
    settings.linkOpenTarget = target;
    const html = renderToStaticMarkup(<LinkTargetIcon />);
    expect(html).toContain(`data-target="${target}"`);
    expect(html).toContain(`title="${words}"`);
    expect(html).toContain(`<span class="sr-only">${words}</span>`);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('leaves the words out when decorative, and shows nothing while the setting is off', () => {
    const decorative = renderToStaticMarkup(<LinkTargetIcon decorative />);
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('sr-only');
    expect(decorative).not.toContain('title=');

    settings.showLinkTarget = false;
    expect(renderToStaticMarkup(<LinkTargetIcon />)).toBe('');
    expect(renderToStaticMarkup(<UrlLink href="https://example.com/a" />)).not.toContain(
      'link-target',
    );
  });

  it('keeps the icon outside the truncated text of a one-line link', () => {
    const html = renderToStaticMarkup(<UrlLink href="https://example.com/a" truncate />);
    expect(html).toMatch(
      /^<a [^>]*class="[^"]*flex min-w-0[^"]*"[^>]*><span class="min-w-0 truncate">https:\/\/example\.com\/a<\/span><span data-slot="link-target"/,
    );
  });
});
