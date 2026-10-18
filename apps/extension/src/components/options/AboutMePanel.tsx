/**
 * Options > AI > About me: a few words about the user that AI prompts include as {{aboutMe}}. Its
 * own synced item (`aboutMeValue`). The draft is saved when the field loses focus, and only when it
 * changed, so an unchanged draft never overwrites newer text from another tab or device; while the
 * field is not being edited, it follows changes made elsewhere.
 */
import { useEffect, useState } from 'react';

export function AboutMePanel() {
  const { value, isLoading } = useStoredValue(aboutMeValue);
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const save = async () => {
    setEditing(false);
    if (draft === value) return;
    try {
      await aboutMeValue.update(() => draft);
      setError(undefined);
    } catch {
      setError(t('aboutMe_errorSaveFailed'));
    }
  };

  if (isLoading) return null;
  return (
    <OptionsPanel
      id="about-me"
      data-testid="about-me"
      title={t('aboutMe_title')}
      description={t('aboutMe_description')}
    >
      <textarea
        id="about-me-text"
        value={draft}
        maxLength={ABOUT_ME_MAX_LENGTH}
        rows={3}
        aria-labelledby="about-me-heading"
        aria-describedby="about-me-description about-me-length"
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p id="about-me-length" className="text-xs text-muted-foreground">
        {t('aboutMe_length', [String(draft.length), String(ABOUT_ME_MAX_LENGTH)])}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </OptionsPanel>
  );
}
