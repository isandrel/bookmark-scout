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
  Save,
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

const AUTOSAVE_DELAY_MS = 400;
const IMPORT_CHANGE_PREVIEW_LIMIT = 5;

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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('appearance');
  const [searchQuery, setSearchQuery] = useState('');
  const [values, setValues] = useState<Settings>(settings);
  const [saveErrors, setSaveErrors] = useState<SettingsFieldErrors>({});
  const [inputErrors, setInputErrors] = useState<SettingsFieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [detectedModels, setDetectedModels] = useState<Partial<Record<AIProvider, string[]>>>({});
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
      setIsSaving(true);
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
        const message = error instanceof Error ? error.message : t('error_unknown');
        // Keep the edits and mark them unsaved so the footer never claims success.
        setSaveErrors((current) => ({
          ...current,
          ...Object.fromEntries(keys.map((key) => [key, message])),
        }));
        toast({
          title: `× ${t('toast_errorSavingSettings')}`,
          description: message,
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [toast],
  );

  // Debounced autosave of changed fields only.
  useEffect(() => {
    if (isLoading) return;
    const changes = getChangedSettings(savedRef.current, values);
    if (Object.keys(changes).length === 0) return;
    const timeoutId = setTimeout(() => void persist(changes), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [values, isLoading, persist]);

  // Do not drop an edit made just before the page is closed or reloaded.
  useEffect(() => {
    const flush = () => void persist(getChangedSettings(savedRef.current, valuesRef.current));
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persist]);

  const setFieldValue = useCallback((fieldKey: keyof Settings, value: SettingValue) => {
    setValues((current) => {
      const next = { ...current, [fieldKey]: value } as Settings;
      // A model that does not belong to the new provider would leave the Model select blank.
      if (fieldKey === 'aiProvider' && value !== current.aiProvider) {
        const provider = value as AIProvider;
        const models = getModelsForProvider(provider).map((model) => model.id);
        if (!models.includes(current.aiModel)) next.aiModel = getDefaultModel(provider);
      }
      return next;
    });
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
      toast({
        title: `✓ ${t('toast_settingsReset')}`,
        description: t('toast_settingsResetDescription'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('toast_errorResettingSettings')}`,
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bookmark-scout-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: `✓ ${t('toast_settingsExported')}`,
        description: t('toast_settingsExportedDescription'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('toast_exportFailed')}`,
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const changed = await importSettings(await file.text());
      const meta = getSettingsFieldMeta();
      const labels = changed.slice(0, IMPORT_CHANGE_PREVIEW_LIMIT).map((key) => meta[key].label);
      const more = changed.length - labels.length;
      toast({
        title: `✓ ${t('toast_settingsImported')}`,
        description:
          changed.length === 0
            ? t('toast_settingsImportedNoChanges')
            : t('toast_settingsImportedChanges', [
                String(changed.length),
                more > 0
                  ? `${labels.join(', ')} ${t('toast_andMore', String(more))}`
                  : labels.join(', '),
              ]),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('toast_importFailed')}`,
        description: error instanceof Error ? error.message : t('error_invalidSettingsFile'),
        variant: 'destructive',
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
  const searchMatchCount = searchResults
    ? Object.values(searchResults).reduce((total, fields) => total + fields.length, 0)
    : 0;

  const modelOptions = (() => {
    const detected = detectedModels[values.aiProvider];
    return detected?.length
      ? detected.map((id) => ({ value: id, label: id }))
      : getModelsForProvider(values.aiProvider).map((model) => ({
          value: model.id,
          label: model.name,
        }));
  })();

  const renderSettingsField = (fieldKey: keyof Settings) => (
    <SettingsFieldRow
      key={fieldKey}
      fieldKey={fieldKey}
      value={values[fieldKey]}
      error={fieldErrors[fieldKey]}
      selectOptions={fieldKey === 'aiModel' ? modelOptions : undefined}
      onChange={(value) => setFieldValue(fieldKey, value)}
      onInputError={(message) => setInputError(fieldKey, message)}
    />
  );

  const renderCategoryHeader = (categoryKey: string, headingLevel: 'h2' | 'h3' = 'h3') => {
    const category = categories[categoryKey];
    const Heading = headingLevel;
    if (categoryKey === 'ai') {
      return (
        <div className="mb-6 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 p-2 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <Heading className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-lg font-semibold text-transparent">
                {category.label}
              </Heading>
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="text-muted-foreground">{t('state_loadingSettings')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto max-w-4xl p-4 sm:p-6">
        <Card className="border-none shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-2xl font-bold">{t('settings_title')}</CardTitle>
                <CardDescription>{t('settings_description')}</CardDescription>
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

            {/* Search bar */}
            <div className="relative mt-4">
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
          </CardHeader>

          <CardContent className="pt-0">
            <Tabs
              value={activeTab}
              onValueChange={(tab) => {
                setActiveTab(tab);
                setSearchQuery('');
              }}
              className="w-full"
            >
              <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                {Object.entries(categories).map(([key, category]) => {
                  const count = searchResults?.[key]?.length;
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      {tabIcons[key]}
                      <span>{category.label}</span>
                      {count !== undefined && (
                        <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {searchResults ? (
                <section aria-live="polite" className="space-y-6">
                  <p className="text-sm text-muted-foreground">
                    {t('settings_searchResultsCount', String(searchMatchCount))}
                  </p>
                  {searchMatchCount === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      {t('state_noSettingsMatch')}
                    </div>
                  ) : (
                    Object.entries(searchResults)
                      .filter(([, fields]) => fields.length > 0)
                      .map(([categoryKey, fields]) => (
                        <div key={categoryKey} data-search-category={categoryKey}>
                          {renderCategoryHeader(categoryKey, 'h2')}
                          <div className="space-y-3">{fields.map(renderSettingsField)}</div>
                        </div>
                      ))
                  )}
                </section>
              ) : (
                Object.entries(categories).map(([categoryKey, category]) => (
                  <TabsContent key={categoryKey} value={categoryKey} className="mt-0">
                    {renderCategoryHeader(categoryKey)}
                    <div className="space-y-3">
                      {category.fields.map(renderSettingsField)}
                      {categoryKey === 'ai' && (
                        <AIProviderPanel
                          provider={values.aiProvider}
                          model={values.aiModel}
                          onModelsDetected={(provider, modelIds) => {
                            setDetectedModels((current) => ({ ...current, [provider]: modelIds }));
                            if (!modelIds.includes(valuesRef.current.aiModel)) {
                              setFieldValue('aiModel', modelIds[0]);
                            }
                          }}
                        />
                      )}
                    </div>
                  </TabsContent>
                ))
              )}
            </Tabs>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap justify-between gap-3 border-t pt-8">
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
                  accept=".json"
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
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('action_resetAll')}
                </Button>
                <output
                  aria-live="polite"
                  data-testid="settings-save-status"
                  className="flex min-w-[140px] items-center justify-end px-3 text-sm text-muted-foreground"
                >
                  {isSaving ? (
                    <span className="flex animate-pulse items-center">
                      <Settings2 className="mr-2 h-3 w-3 animate-spin" />
                      {t('action_saving')}
                    </span>
                  ) : errorCount > 0 ? (
                    <span className="flex items-center text-destructive">
                      <TriangleAlert className="mr-2 h-3 w-3" />
                      {t('settings_statusNotSaved', String(errorCount))}
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Save className="mr-2 h-3 w-3 opacity-50" />
                      {t('toast_settingsSaved')}
                    </span>
                  )}
                </output>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
};

export default OptionsPage;
