import { beforeAll, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { getSettingsFieldMeta } from '@/lib/settings-schema';
import en from '../../public/_locales/en/messages.json';

/**
 * A setting gets its toggletip from a `settings_<stem>Help` message alone, so adding help to a
 * setting is a new message, not new code; a help message must belong to a setting.
 */
describe('setting help', () => {
  beforeAll(() => setLanguage('en'));
  const meta = () => getSettingsFieldMeta();
  const labels = () => new Set(Object.values(meta()).map((field) => field.label));

  it('shows the help message of a setting that has one, and none for the others', () => {
    expect(meta().deadLinksConcurrency.help).toBe(en.settings_deadLinksConcurrencyHelp.message);
    expect(meta().searchDebounceMs.help).toBe(en.settings_searchDelayHelp.message);
    expect(meta().deadLinksDefaultScope.help).toBeUndefined();
  });

  it('has every help message belong to a setting', () => {
    const orphans = Object.keys(en)
      .filter((key) => /^settings_\w+Help$/.test(key))
      .map((key) => key.replace(/Help$/, ''))
      .filter((labelKey) => {
        const label = (en as Record<string, { message: string } | undefined>)[labelKey]?.message;
        return !label || !labels().has(label);
      });
    expect(orphans).toEqual([]);
  });
});
