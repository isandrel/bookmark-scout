/**
 * What the Options settings search matched (`settings-search.ts`): the words marked where a row
 * shows the text they were found in, and a note for words found only in text the row does not
 * show, so every result says why it is there.
 */
import { TextSearch } from 'lucide-react';

/**
 * A setting's label or description, with the search's words marked when the setting matched.
 * A setting shown only because its group is (a pair's other number) stays unmarked.
 */
export function SettingSearchText({
  fieldKey,
  source,
}: {
  fieldKey: keyof Settings;
  source: Exclude<SettingSearchSource, 'id'>;
}) {
  const match = useSettingSearchMatch(fieldKey);
  const text = getSettingsFieldMeta()[fieldKey][source];
  if (!match) return text;
  return <HighlightedText text={text} ranges={match[source].ranges} showTitle={false} />;
}

const NOTE_MESSAGES = {
  label: 'settings_searchMatchedLabel',
  description: 'settings_searchMatchedDescription',
  id: 'settings_searchMatchedId',
} as const satisfies Record<SettingSearchSource, MessageKey>;

/**
 * For a matched setting, the texts it was found in that its row does not show (`shown` lists the
 * ones it does), each with the words marked. Nothing when the shown text explains the match.
 */
export function SettingSearchNote({
  fieldKey,
  shown,
}: {
  fieldKey: keyof Settings;
  shown: readonly SettingSearchSource[];
}) {
  const match = useSettingSearchMatch(fieldKey);
  const hidden = match ? hiddenSettingMatches(match, shown) : [];
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

/**
 * Text outside the settings, such as an AI services field, with the search's words marked when
 * the search matched it: every word in `within`, the texts it is searched by (itself by default).
 */
export function SearchMatchText({ text, within }: { text: string; within?: readonly string[] }) {
  const query = useSettingsSearchQuery();
  if (!query || !matchesEveryTerm(within ?? [text], query)) return text;
  return (
    <HighlightedText text={text} ranges={findTextMatches(text, query).ranges} showTitle={false} />
  );
}
