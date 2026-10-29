/**
 * What the Options settings search matched (`settings-search.ts`). Inside the results, every
 * visible text marks the search's words wherever it holds them (labels, descriptions, section
 * headings, group titles), as Chrome's settings search does, so a user sees each word they typed;
 * the category's own title and intro stay unmarked. A setting found by a word in text its row does
 * not show gets a note saying where, so every result says why it is there.
 */
import { TextSearch } from 'lucide-react';

/** Text shown in the search results, with the search's words marked; plain outside a search. */
export function SearchMatchText({ text }: { text: string }) {
  const query = useSettingsSearchQuery();
  if (!query) return text;
  return (
    <HighlightedText text={text} ranges={findTextMatches(text, query).ranges} showTitle={false} />
  );
}

/** A setting's label or description, with the search's words marked. */
export function SettingSearchText({
  fieldKey,
  source,
}: {
  fieldKey: keyof Settings;
  source: Exclude<SettingSearchSource, 'id'>;
}) {
  return <SearchMatchText text={getSettingsFieldMeta()[fieldKey][source]} />;
}

const NOTE_MESSAGES = {
  label: 'settings_searchMatchedLabel',
  description: 'settings_searchMatchedDescription',
  id: 'settings_searchMatchedId',
} as const satisfies Record<SettingSearchSource, MessageKey>;

/**
 * For a matched setting, the texts it was found in that its row does not show (`shown` lists the
 * ones it does), each with the words marked. Nothing when the visible text explains the match:
 * the shown texts, and `nearby` text such as the heading above a section's switch.
 */
export function SettingSearchNote({
  fieldKey,
  shown,
  nearby,
}: {
  fieldKey: keyof Settings;
  shown: readonly SettingSearchSource[];
  nearby?: string;
}) {
  const query = useSettingsSearchQuery();
  const match = useSettingSearchMatch(fieldKey);
  const hidden =
    match && query
      ? hiddenSettingMatches(
          match,
          shown,
          nearby ? findTextMatches(nearby, query).terms : undefined,
        )
      : [];
  if (!match || hidden.length === 0) return null;
  return (
    <div data-testid="setting-search-note" data-setting-note={fieldKey} className="space-y-0.5">
      {hidden.map((source) => (
        <p
          key={source}
          data-source={source}
          className="flex items-start gap-1.5 text-xs text-muted-foreground"
        >
          <TextSearch aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {t(NOTE_MESSAGES[source])}{' '}
            <HighlightedText
              text={match[source].text}
              ranges={match[source].ranges}
              showTitle={false}
              className={source === 'id' ? 'font-mono' : undefined}
            />
          </span>
        </p>
      ))}
    </div>
  );
}
