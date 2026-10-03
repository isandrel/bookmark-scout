/**
 * OptionsPage - Settings page with multi-tab interface.
 * Edits autosave field by field: valid changes persist immediately, invalid ones stay in the form
 * with an inline error until they are fixed, and never block other fields.
 */

import {
  BarChart3,
  Download,
  FolderKanban,
  HardDriveDownload,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  TriangleAlert,
  Upload,
  Wrench,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

const optionsConfig = readConfig(
  'ui/options',
  z.strictObject({
    autosave_delay_ms: z.number().int().nonnegative(),
    import_change_preview_limit: z.number().int().positive(),
    default_category: z
      .string()
      .refine((key) => key in getSettingsCategories(), 'not a settings category'),
    settings_export_filename: z.string().min(1),
  }),
);

// Tab icons mapping
const tabIcons: Record<string, React.ReactNode> = {
  appearance: <Palette className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  behavior: <Settings2 className="h-4 w-4" />,
  advanced: <Sliders className="h-4 w-4" />,
  ai: <Sparkles className="h-4 w-4" />,
  aiTools: <Sparkles className="h-4 w-4" />,
  maintenance: <Wrench className="h-4 w-4" />,
  metadataContent: <FolderKanban className="h-4 w-4" />,
  security: <ShieldAlert className="h-4 w-4" />,
  analytics: <BarChart3 className="h-4 w-4" />,
  data: <HardDriveDownload className="h-4 w-4" />,
};

type SettingValue = Settings[keyof Settings];

function matchesQuery(fieldKey: keyof Settings, query: string): boolean {
  const meta = getSettingsFieldMeta()[fieldKey];
  const needle = query.trim().toLowerCase();
  return [meta.label, meta.description, fieldKey].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

const OptionsPage: React.FC = () => {
  const { settings, isLoading, resetToDefaults } = useSettings();
  const { resolvedTheme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState(optionsConfig.default_category);
  const [searchQuery, setSearchQuery] = useState('');
  const [values, setValues] = useState<Settings>(settings);
  const [saveErrors, setSaveErrors] = useState<SettingsFieldErrors>({});
  const [inputErrors, setInputErrors] = useState<SettingsFieldErrors>({});
  // Bumped by Reset All so rows drop unsaved input text, such as an invalid list draft.
  const [formVersion, setFormVersion] = useState(0);
  const savedRef = useRef<Settings>(settings);
  const valuesRef = useRef<Settings>(values);
  valuesRef.current = values;

  const categories = getSettingsCategories();
  const fieldErrors = { ...saveErrors, ...inputErrors };
  const errorCount = Object.keys(fieldErrors).length;

  // Take stored settings (from this page, another page, sync, or import) while keeping local
  // edits that have not been persisted yet.
  useEffect(() => {
    if (isLoading) return;
    const previous = savedRef.current;
    savedRef.current = settings;
    setValues((current) => ({ ...settings, ...getChangedSettings(previous, current) }));
  }, [settings, isLoading]);

  const persist = useCallback(
    async (changes: Partial<Settings>) => {
      const keys = Object.keys(changes) as (keyof Settings)[];
      if (keys.length === 0) return;
      try {
        const { settings: saved, errors } = await saveValidSettings(changes);
        savedRef.current = saved;
        setSaveErrors((current) => {
          const next = { ...current };
          for (const key of keys) {
            if (errors[key]) next[key] = errors[key];
            else delete next[key];
          }
          return next;
        });
      } catch (error) {
        const message = getErrorMessage(error);
        // Keep the edits and mark them unsaved so the footer never claims success.
        setSaveErrors((current) => ({
          ...current,
          ...Object.fromEntries(keys.map((key) => [key, message])),
        }));
        toast.error({ title: t('toast_errorSavingSettings'), description: message });
      }
    },
    [],
  );

  // Debounced autosave of changed fields only.
  useEffect(() => {
    if (isLoading) return;
    // A field back at its saved value (reset, or the saved text typed again) has nothing to save.
    setSaveErrors((current) => dropSettledErrors(current, savedRef.current, values));
    const changes = getChangedSettings(savedRef.current, values);
    if (Object.keys(changes).length === 0) return;
    const timeoutId = setTimeout(() => void persist(changes), optionsConfig.autosave_delay_ms);
    return () => clearTimeout(timeoutId);
  }, [values, isLoading, persist]);

  // Do not drop an edit made just before the page is closed, reloaded, or hidden. The write must
  // start synchronously: an async read first would not finish before the page unloads.
  useEffect(() => {
    const flush = () => {
      const changes = getChangedSettings(savedRef.current, valuesRef.current);
      if (Object.keys(changes).length === 0) return;
      const { settings: saved, saved: done } = saveValidSettingsNow(savedRef.current, changes);
      savedRef.current = saved;
      done.catch((error) => settingsLogger.error({ error }, 'Failed to save settings on page hide'));
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, []);

  const setFieldValue = useCallback((fieldKey: keyof Settings, value: SettingValue) => {
    setValues((current) => ({ ...current, [fieldKey]: value }) as Settings);
  }, []);

  const setInputError = useCallback((fieldKey: keyof Settings, message: string | undefined) => {
    setInputErrors((current) => {
      if (current[fieldKey] === message) return current;
      const next = { ...current };
      if (message) next[fieldKey] = message;
      else delete next[fieldKey];
      return next;
    });
  }, []);

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setFieldValue('theme', next);
  };

  const handleReset = async () => {
    try {
      await resetToDefaults();
      savedRef.current = defaultSettings;
      setValues(defaultSettings);
      setSaveErrors({});
      setInputErrors({});
      setFormVersion((version) => version + 1);
      toast.success({
        title: t('toast_settingsReset'),
        description: t('toast_settingsResetDescription'),
      });
    } catch (error) {
      toast.error({
        title: t('toast_errorResettingSettings'),
        description: getErrorMessage(error),
      });
    }
  };

  const handleExport = async () => {
    try {
      downloadExport(
        await exportSettings(),
        optionsConfig.settings_export_filename,
        jsonFormat.mimeType,
      );
      toast.success({
        title: t('toast_settingsExported'),
        description: t('toast_settingsExportedDescription'),
      });
    } catch (error) {
      toast.error({ title: t('toast_exportFailed'), description: getErrorMessage(error) });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const changed = await importSettings(await file.text());
      const meta = getSettingsFieldMeta();
      const labels = changed.map((key) => meta[key].label);
      toast.success({
        title: t('toast_settingsImported'),
        description:
          changed.length === 0
            ? t('toast_settingsImportedNoChanges')
            : t('toast_settingsImportedChanges', [
                String(changed.length),
                formatListPreview(labels, optionsConfig.import_change_preview_limit),
              ]),
      });
    } catch (error) {
      toast.error({
        title: t('toast_importFailed'),
        description: getErrorMessage(error, 'error_invalidSettingsFile'),
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return Object.fromEntries(
      Object.entries(categories).map(([key, category]) => [
        key,
        category.fields.filter((fieldKey) => matchesQuery(fieldKey, searchQuery)),
      ]),
    ) as Record<string, (keyof Settings)[]>;
  }, [categories, searchQuery]);
  // AI services are not synced settings, so their fields are matched separately.
  const aiPanelFieldMatches = useMemo(() => matchAIServicesSearch(searchQuery), [searchQuery]);
  const aiPanelMatches = aiPanelFieldMatches.length;
  const searchMatchCount = searchResults
    ? Object.values(searchResults).reduce((total, fields) => total + fields.length, 0) +
      aiPanelMatches
    : 0;

  const changeSettingsField = (fieldKey: keyof Settings, value: SettingValue) => {
    if (value !== true || !getSettingsFieldMeta()[fieldKey].requiresWebHostAccess) {
      setFieldValue(fieldKey, value);
      return;
    }
    // Ask inside the click so the browser treats the request as user-initiated; the switch
    // only turns on once access is granted.
    void requestWebHostAccess().then((granted) => {
      if (granted) {
        setFieldValue(fieldKey, value);
        return;
      }
      toast.error({
        title: t('tools_hostAccessDenied'),
        description: t('settings_hostAccessDeniedDesc'),
      });
    });
  };

  const renderSettingsField = (fieldKey: keyof Settings) => (
    <SettingsFieldRow
      key={`${fieldKey}-${formVersion}`}
      fieldKey={fieldKey}
      value={values[fieldKey]}
      error={fieldErrors[fieldKey]}
      onChange={(value) => changeSettingsField(fieldKey, value)}
      onInputError={(message) => setInputError(fieldKey, message)}
    />
  );

  /** Renders settings in order; members of a checklist group render once, as the group. */
  const renderSettingsFields = (fields: readonly (keyof Settings)[]) => {
    const groups = getSettingsFieldGroups();
    const renderedGroups = new Set<string>();
    return fields.flatMap((fieldKey) => {
      const group = groups.find((candidate) => candidate.fields.includes(fieldKey));
      if (!group) return [renderSettingsField(fieldKey)];
      if (renderedGroups.has(group.id)) return [];
      renderedGroups.add(group.id);
      return [
        <SettingsGroupRow
          key={`${group.id}-${formVersion}`}
          group={group}
          values={values}
          onChange={changeSettingsField}
        />,
      ];
    });
  };

  const renderCategoryHeader = (categoryKey: string, headingLevel: 'h2' | 'h3' = 'h3') => {
    const category = categories[categoryKey];
    const Heading = headingLevel;
    if (categoryKey === 'ai') {
      return (
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-ai/10 p-2 text-ai">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <Heading className="text-lg font-semibold">{category.label}</Heading>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="mb-4">
        <Heading className="text-lg font-semibold">{category.label}</Heading>
        <p className="text-sm text-muted-foreground">{category.description}</p>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <output className="text-sm text-muted-foreground">{t('state_loadingSettings')}</output>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 sm:px-6">
        <header className="py-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {t('settings_title')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('settings_description')}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === 'dark' ? t('action_switchToLight') : t('action_switchToDark')
              }
              title={
                resolvedTheme === 'dark' ? t('action_switchToLight') : t('action_switchToDark')
              }
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          </div>
        </header>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(tab) => {
            setActiveTab(tab);
            setSearchQuery('');
          }}
          className="flex flex-col gap-6 sm:flex-row sm:items-start"
        >
          {/* Category list on the left; it wraps into rows above the settings on narrow windows. */}
          <div className="shrink-0 space-y-3 sm:sticky sm:top-6 sm:w-56">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t('settings_searchPlaceholder')}
                aria-label={t('settings_searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:flex-col sm:items-stretch">
              {Object.entries(categories).map(([key, category]) => {
                const matches = searchResults?.[key]?.length;
                const count =
                  matches === undefined
                    ? undefined
                    : matches + (key === 'ai' ? aiPanelMatches : 0);
                return (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="h-8 justify-start gap-2 rounded-md px-2.5 py-0 font-normal text-muted-foreground hover:bg-muted hover:text-foreground data-active:bg-accent data-active:font-medium data-active:text-accent-foreground data-active:shadow-none [&_svg]:size-4"
                  >
                    {tabIcons[key]}
                    <span className="flex-1 truncate text-left">{category.label}</span>
                    {count !== undefined && (
                      <span className="rounded-full bg-muted px-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="min-w-0 flex-1">
            {searchResults ? (
              <section aria-live="polite" className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {tPlural('settings_searchResultsCount', searchMatchCount)}
                </p>
                {searchMatchCount === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {t('state_noSettingsMatch')}
                  </div>
                ) : (
                  Object.entries(searchResults)
                    .filter(
                      ([categoryKey, fields]) =>
                        fields.length > 0 || (categoryKey === 'ai' && aiPanelMatches > 0),
                    )
                    .map(([categoryKey, fields]) => (
                      <div key={categoryKey} data-search-category={categoryKey}>
                        {renderCategoryHeader(categoryKey, 'h2')}
                        <div className="space-y-3">
                          {renderSettingsFields(fields)}
                          {categoryKey === 'ai' &&
                            aiPanelMatches > 0 && (
                              <AIServicesPanel
                                showAdvanced={aiPanelFieldMatches.some((field) => field.advanced)}
                              />
                            )}
                        </div>
                      </div>
                    ))
                )}
              </section>
            ) : (
              Object.entries(categories).map(([categoryKey, category]) => (
                <TabsContent key={categoryKey} value={categoryKey} className="mt-0">
                  {renderCategoryHeader(categoryKey)}
                  <div className="space-y-3">
                    {categoryKey === 'ai' ? (
                      // Services come right after the AI switch: they are what the switch turns on.
                      <>
                        {renderSettingsFields(category.fields.slice(0, 1))}
                        <AIServicesPanel />
                        {renderSettingsFields(category.fields.slice(1))}
                        <AIActivityPanel />
                      </>
                    ) : categoryKey === 'aiTools' ? (
                      <>
                        <PromptLibraryPanel />
                        {renderSettingsFields(category.fields)}
                      </>
                    ) : (
                      renderSettingsFields(category.fields)
                    )}
                  </div>
                </TabsContent>
              ))
            )}
          </div>
        </Tabs>
      </div>

      {/* The save status and data actions stay reachable while scrolling long categories. */}
      <footer className="sticky bottom-0 border-t bg-background/95 backdrop-blur">
        {/* Action Buttons */}
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              {t('action_export')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('action_import')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={`.${jsonFormat.extension}`}
              className="hidden"
              aria-label={t('action_import')}
              onChange={handleImport}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="hover:bg-destructive-wash hover:text-destructive-text"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('action_resetAll')}
            </Button>
            {/* Settings save as they change, so only a failed save needs saying. */}
            <output
              aria-live="polite"
              data-testid="settings-save-status"
              className="flex items-center justify-end px-3 text-sm text-destructive-text empty:hidden"
            >
              {errorCount > 0 && (
                <span className="flex items-center">
                  <TriangleAlert className="mr-2 h-3 w-3" />
                  {tPlural('settings_statusNotSaved', errorCount)}
                </span>
              )}
            </output>
          </div>
        </div>
      </footer>
      <Toaster />
    </div>
  );
};

export default OptionsPage;
