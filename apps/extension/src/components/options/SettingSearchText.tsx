/**
 * What the Options settings search matched (`settings-search.ts`). Inside the results, every
 * visible text marks the search's words wherever it holds them (labels, descriptions, section
 * headings, group titles), as Chrome's settings search does, so a user sees each word they typed;
 * the category's own title and intro stay unmarked. A setting found by a word in text its row does
 * not show gets a note saying where, so every result says why it is there. Highlight Matches and
 * Explain Hidden Matches (Saving & Search > Settings Search) turn the marks and notes off.
 */
import { TextSearch } from 'lucide-react';

/** The marks for `text`, or none outside a search or with Highlight Matches off. */
function markedRanges(text: string, search: SettingsSearchState | undefined) {
  return search?.highlight ? findTextMatches(text, search.query).ranges : undefined;
}

/** Text shown in the search results, with the search's words marked; plain outside a search. */
export function SearchMatchText({ text }: { text: string }) {
  const ranges = markedRanges(text, useSettingsSearch());
  if (!ranges) return text;
  return <HighlightedText text={text} ranges={ranges} showTitle={false} />;
}

/** A setting's label or description, with the search's words marked. */
export function SettingSearchText({
  fieldKey,
  source,
}: {
  fieldKey: keyof Settings;
  source: 'label' | 'description';
}) {
  const text = SETTING_SEARCH_SOURCES[source].read(fieldKey, getSettingsFieldMeta()[fieldKey]);
  return <SearchMatchText text={text} />;
}

/**
 * For a matched setting, the searched texts it was found in that its row does not show (`shown`
 * lists the ones it does), each with the words marked. Nothing when the visible text explains the
 * match (the shown texts, and `nearby` text such as the heading above a section's switch), or
 * with Explain Hidden Matches off.
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
  const search = useSettingsSearch();
  const match = useSettingSearchMatch(fieldKey);
  if (!search?.notes || !match) return null;
  const hidden = hiddenSettingMatches(
    match,
    shown,
    nearby ? findTextMatches(nearby, search.query).terms : undefined,
  );
  if (hidden.length === 0) return null;
  return (
    <div data-testid="setting-search-note" data-setting-note={fieldKey} className="space-y-0.5">
      {hidden.map(({ source, text, ranges }) => (
        <p
          key={source}
          data-source={source}
          className="flex items-start gap-1.5 text-xs text-muted-foreground"
        >
          <TextSearch aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {t(SETTING_SEARCH_SOURCES[source].note)}{' '}
            <HighlightedText
              text={text}
              ranges={search.highlight ? ranges : undefined}
              showTitle={false}
              className={'code' in SETTING_SEARCH_SOURCES[source] ? 'font-mono' : undefined}
            />
          </span>
        </p>
      ))}
    </div>
  );
}
