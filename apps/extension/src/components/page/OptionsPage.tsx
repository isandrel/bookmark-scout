/**
 * OptionsPage - Settings page with multi-tab interface.
 * Edits autosave field by field: valid changes persist immediately, invalid ones stay in the form
 * with an inline error until they are fixed, and never block other fields.
 */

import {
  BarChart3,
  BookMarked,
  Code,
  Download,
  FolderKanban,
  HardDriveDownload,
  Info,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Star,
  Sun,
  TriangleAlert,
  Upload,
  Wrench,
} from 'lucide-react';
import type React from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

/** Essentials or a settings category: the tabs on the left. */
function isSettingsTab(key: string): boolean {
  return key === ESSENTIALS_CATEGORY || key in getSettingsCategories();
}

const optionsConfig = readConfig(
  'ui/options',
  z.strictObject({
    autosave_delay_ms: z.number().int().nonnegative(),
    import_change_preview_limit: z.number().int().positive(),
    default_category: z.string().refine((key) => isSettingsTab(key), 'not a settings category'),
    backup_filename: z.string().min(1),
    restore_notice_duration_ms: z.number().int().positive(),
  }),
);

/** The secret fields each AI service needs entered again: `Work (API Key)`, as one list. */
function describeServicesNeedingSetup(services: readonly ServiceNeedingSetup[]): string {
  const labels: Record<AISecretField, MessageKey> = {
    apiKey: 'options_apiKey',
    extraHeaders: 'options_extraHeaders',
  };
  return formatList(
    services.map(({ name, fields }) =>
      t('toast_backupServiceNeeds', [name, formatList(fields.map((field) => t(labels[field])))]),
    ),
  );
}

/** `options.html?category=ai` opens on that category, as quick save's "Open AI settings" does. */
function initialCategory(): string {
  const requested = new URLSearchParams(window.location.search).get('category');
  return requested && isSettingsTab(requested) ? requested : optionsConfig.default_category;
}

// Tab icons mapping
const tabIcons: Record<string, React.ReactNode> = {
  essentials: <Star className="h-4 w-4" />,
  appearance: <Palette className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  behavior: <Settings2 className="h-4 w-4" />,
  ai: <Sparkles className="h-4 w-4" />,
  aiTools: <Sparkles className="h-4 w-4" />,
  maintenance: <Wrench className="h-4 w-4" />,
  metadataContent: <FolderKanban className="h-4 w-4" />,
  security: <ShieldAlert className="h-4 w-4" />,
  analytics: <BarChart3 className="h-4 w-4" />,
  data: <HardDriveDownload className="h-4 w-4" />,
  developers: <Code className="h-4 w-4" />,
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
  const aiServiceSetUp = useAIServiceSetUp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [values, setValues] = useState<Settings>(settings);
  const [saveErrors, setSaveErrors] = useState<SettingsFieldErrors>({});
  const [inputErrors, setInputErrors] = useState<SettingsFieldErrors>({});
  // Bumped by Reset All so rows drop unsaved input text, such as an invalid list draft.
  const [formVersion, setFormVersion] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const savedRef = useRef<Settings>(settings);
  const valuesRef = useRef<Settings>(values);
  valuesRef.current = values;

  const categories = getSettingsCategories();
  // Every tab: Essentials, then each setting's own category. Search reads only `categories`.
  const tabs: Record<string, SettingsCategoryMeta> = {
    [ESSENTIALS_CATEGORY]: getEssentialsCategory(),
    ...categories,
  };
  const firstAdvancedTab = Object.keys(categories)[0];
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

  const persist = useCallback(async (changes: Partial<Settings>) => {
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
  }, []);

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

  // Save an edit made just before the page is hidden, closed, or reloaded without waiting for the
  // autosave delay. The background does the save: it reads the stored settings under the same lock
  // as every other save, which an unloading page would not live to finish.
  useEffect(() => {
    const flush = () => {
      const changes = getChangedSettings(savedRef.current, valuesRef.current);
      if (Object.keys(changes).length > 0) saveSettingsFromClosingPage(changes);
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

  /** Drops what the rows show and hold that no longer applies, such as an invalid list draft. */
  const clearDrafts = () => {
    setSaveErrors({});
    setInputErrors({});
    setFormVersion((version) => version + 1);
  };

  const handleReset = async () => {
    try {
      const previous = await resetToDefaults();
      savedRef.current = defaultSettings;
      setValues(defaultSettings);
      clearDrafts();
      toast.withUndo({
        title: t('toast_settingsReset'),
        description: t('toast_settingsResetDescription'),
        onUndo: async () => {
          try {
            await undoResetSettings(previous);
            clearDrafts();
            toast.success({ title: t('toast_settingsResetUndone') });
          } catch (error) {
            toast.error({
              title: t('toast_errorResettingSettings'),
              description: getErrorMessage(error),
            });
          }
        },
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
      downloadExport(await exportBackup(), optionsConfig.backup_filename, jsonFormat.mimeType);
      toast.success({
        title: t('toast_backupExported'),
        description: t('toast_backupExportedDescription'),
      });
    } catch (error) {
      toast.error({ title: t('toast_exportFailed'), description: getErrorMessage(error) });
    }
  };

  const restoreFile = async (file: File) => {
    try {
      const content = await file.text();
      // A backup restores everything it holds; any other JSON is read as a settings file.
      if (isBackupFile(content)) {
        const { needsSetup } = await restoreBackup(content);
        toast.success({
          title: t('toast_backupRestored'),
          description:
            needsSetup.length === 0
              ? t('toast_backupRestoredDescription')
              : t('toast_backupRestoredNeedsSetup', describeServicesNeedingSetup(needsSetup)),
          // Long enough to read which services need what.
          ...(needsSetup.length > 0 ? { duration: optionsConfig.restore_notice_duration_ms } : {}),
        });
        return;
      }
      const changed = await importSettings(content);
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
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void restoreFile(file);
  };

  // A backup or settings file dropped anywhere on the page restores like Restore settings.
  const fileDrop = useFileDrop<HTMLDivElement>({
    accept: (file) => file.name.toLowerCase().endsWith(`.${jsonFormat.extension}`),
    onFiles: ([file]) => void restoreFile(file),
    onReject: () =>
      toast.error({
        title: t('toast_importFailed'),
        description: t('error_invalidSettingsFile'),
      }),
  });

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

  // A switch whose permission is missing shows as off, though the synced value may be on.
  const shownValues = useEffectiveSettings(values);

  // A setting waiting on the explanation dialog of its permission (AI, Read page content).
  const [explainingField, setExplainingField] = useState<keyof Settings | null>(null);
  const explainingFeature = explainingField ? getSettingPermission(explainingField) : undefined;

  /** Requests the setting's permission and turns it on once granted. */
  const requestAndEnable = (fieldKey: keyof Settings, feature: PermissionFeature) => {
    void requestPermission(feature).then((granted) => {
      if (granted) {
        setFieldValue(fieldKey, true);
        return;
      }
      notifyPermissionDenied(feature);
    });
  };

  const changeSettingsField = (fieldKey: keyof Settings, value: SettingValue) => {
    const feature = getSettingPermission(fieldKey);
    if (value !== true || !feature) {
      setFieldValue(fieldKey, value);
      return;
    }
    if (!(PERMISSION_FEATURES[feature] as PermissionFeatureDefinition).explanation) {
      // Ask inside the click so the browser treats the request as user-initiated; the switch
      // only turns on once the permission is granted.
      requestAndEnable(fieldKey, feature);
      return;
    }
    // Explain first, but only when the browser would actually prompt: the dialog's Allow
    // button is the click the request then runs in.
    void hasPermission(feature).then((granted) => {
      if (granted) setFieldValue(fieldKey, true);
      else setExplainingField(fieldKey);
    });
  };

  const renderSettingsField = (fieldKey: keyof Settings) => (
    <SettingsFieldRow
      key={`${fieldKey}-${formVersion}`}
      fieldKey={fieldKey}
      value={shownValues[fieldKey]}
      error={fieldErrors[fieldKey]}
      onChange={(value) => changeSettingsField(fieldKey, value)}
      onInputError={(message) => setInputError(fieldKey, message)}
    />
  );

  /**
   * Renders settings in order; members of a group render once, as the group's row. `visible` is
   * every setting the category shows, so a group stays whole when a search matched one member.
   */
  const renderSettingsFields = (
    fields: readonly (keyof Settings)[],
    visible: ReadonlySet<keyof Settings>,
  ) => {
    const groups = getSettingsFieldGroups();
    const renderedGroups = new Set<string>();
    return fields.flatMap((fieldKey) => {
      const group = groups.find((candidate) => candidate.fields.includes(fieldKey));
      if (!group) return [renderSettingsField(fieldKey)];
      if (renderedGroups.has(group.id)) return [];
      renderedGroups.add(group.id);
      const props = { group, values: shownValues, visible, onChange: changeSettingsField };
      const key = `${group.id}-${formVersion}`;
      if (group.kind === 'pair') return [<SettingsPairRow key={key} {...props} />];
      if (group.kind === 'switch') return [<SettingsSwitchRow key={key} {...props} />];
      return [<SettingsGroupRow key={key} {...props} />];
    });
  };

  /** A section's on/off setting, as a switch beside its heading. */
  const renderSectionToggle = (fieldKey: keyof Settings, headingId: string) => (
    <span data-setting={fieldKey} className="shrink-0">
      <Switch
        id={getSettingControlId(fieldKey)}
        checked={shownValues[fieldKey] === true}
        onCheckedChange={(checked) => changeSettingsField(fieldKey, checked)}
        aria-label={getSettingsFieldMeta()[fieldKey].label}
        aria-describedby={headingId}
      />
    </span>
  );

  /** The panel a section draws after its fields; in a search, only when it matched. */
  const renderPanel = (panel: SettingsPanelId | undefined, matchesOnly: boolean) => {
    switch (panel) {
      case 'aiIntro':
        // Until the default service is set up; after that it would only push the settings down.
        return matchesOnly || aiServiceSetUp !== false ? null : <AIIntroPanel />;
      case 'aiServices':
        if (!matchesOnly) return <AIServicesPanel />;
        return aiPanelMatches > 0 ? (
          <AIServicesPanel
            showAdvanced={aiPanelFieldMatches.some((field) => field.advanced)}
            searchMatches={aiPanelFieldMatches}
          />
        ) : null;
      case 'aiActivity':
        return matchesOnly ? null : <AIActivityPanel />;
      case 'promptLibrary':
        return matchesOnly ? null : <PromptLibraryPanel />;
      case 'aboutMe':
        return matchesOnly ? null : <AboutMePanel />;
      case 'shortcuts':
        return matchesOnly ? null : <ShortcutsPanel />;
      case 'managerMenus':
        return matchesOnly ? null : <ManagerMenusPanel />;
      case 'askAiActions':
        return matchesOnly ? null : <AskAIActionsPanel />;
      case 'agentBridge':
        return matchesOnly ? null : <AgentBridgePanel />;
      case 'bookmarkRules':
        return matchesOnly ? null : <BookmarkRulesPanel />;
      case 'essentialsAi':
        return matchesOnly ? null : (
          <OptionsPanel
            id="essentials-ai"
            data-testid="essentials-ai"
            title={t('essentials_aiTitle')}
            description={t('essentials_aiDescription')}
            actionsLayout="wrap"
            actions={
              <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab('ai')}>
                <Sparkles className="mr-2 h-4 w-4 text-ai" />
                {t('essentials_aiOpen')}
              </Button>
            }
          />
        );
      default:
        return null;
    }
  };

  /**
   * A category's titled sections, the page's second level. With `matches` (a search), only the
   * matching settings and the sections that hold them.
   */
  const renderSections = (categoryKey: string, matches?: ReadonlySet<keyof Settings>) => {
    const visible = new Set(tabs[categoryKey].fields);
    const pick = (list: readonly (keyof Settings)[]) =>
      matches ? list.filter((fieldKey) => matches.has(fieldKey)) : list;
    const meta = getSettingsFieldMeta();
    // Each switch that is off explains itself once, above the first section that needs it.
    const explained = new Set<SectionRequirement>();
    return (
      <div className="space-y-8">
        {tabs[categoryKey].sections.map((section) => {
          const fields = pick(section.fields);
          const advanced = pick(section.advanced ?? []);
          const panel = renderPanel(section.panel, Boolean(matches));
          const toggleShown =
            section.toggle !== undefined && (!matches || matches.has(section.toggle));
          if (fields.length === 0 && advanced.length === 0 && !panel && !toggleShown) return null;
          // A search shows what matched even in a section that is turned off.
          const folded =
            !matches && section.toggle !== undefined && shownValues[section.toggle] !== true;
          const headingId = `settings-section-${categoryKey}-${section.id}`;
          const unmet =
            section.requires !== undefined && shownValues[section.requires] !== true
              ? section.requires
              : undefined;
          const requirementNotice =
            unmet !== undefined && !explained.has(unmet) ? (
              <p
                role="note"
                data-testid="settings-requirement-notice"
                className="flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-sm text-foreground"
              >
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {t(SECTION_REQUIREMENT_NOTICES[unmet])}
              </p>
            ) : null;
          if (unmet !== undefined) explained.add(unmet);
          return (
            <Fragment key={section.id}>
              {requirementNotice}
              <section
                data-settings-section={section.id}
                data-requirement-off={unmet}
                aria-labelledby={section.label ? headingId : undefined}
                // Greyed out but still editable and readable: nothing here runs until it is on.
                className={cn('space-y-3', unmet !== undefined && 'opacity-70 grayscale')}
              >
                {section.label ? (
                  <div className="flex items-center justify-between gap-3">
                    <h3 id={headingId} className="text-base font-semibold text-foreground">
                      {section.label}
                    </h3>
                    {section.toggle && renderSectionToggle(section.toggle, headingId)}
                  </div>
                ) : null}
                {folded ? (
                  <p className="text-sm text-muted-foreground">{t('settings_sectionOff')}</p>
                ) : (
                  <>
                    {renderSettingsFields(fields, visible)}
                    {advanced.length > 0 && (
                      <SettingsAdvancedFold
                        labels={advanced.map((fieldKey) => meta[fieldKey].label)}
                        forceOpen={
                          Boolean(matches) ||
                          advanced.some(
                            (fieldKey) =>
                              Boolean(fieldErrors[fieldKey]) ||
                              JSON.stringify(shownValues[fieldKey]) !==
                                JSON.stringify(defaultSettings[fieldKey]),
                          )
                        }
                      >
                        {renderSettingsFields(advanced, visible)}
                      </SettingsAdvancedFold>
                    )}
                    {panel}
                  </>
                )}
              </section>
            </Fragment>
          );
        })}
      </div>
    );
  };

  const renderCategoryHeader = (categoryKey: string) => {
    const category = tabs[categoryKey];
    if (categoryKey === 'ai') {
      return (
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-ai/10 p-2 text-ai">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{category.label}</h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{category.label}</h2>
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
    <div
      ref={fileDrop.ref}
      data-testid="options-page"
      className="flex min-h-screen flex-col bg-background"
    >
      {fileDrop.fileDragActive && (
        <div
          aria-hidden="true"
          data-testid="restore-drop-overlay"
          data-file-over={fileDrop.over || undefined}
          className="file-drop-overlay"
        >
          <p>{t('fileDrop_restore')}</p>
        </div>
      )}
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
              {Object.entries(tabs).map(([key, category]) => {
                const matches = searchResults?.[key]?.length;
                const count =
                  matches === undefined ? undefined : matches + (key === 'ai' ? aiPanelMatches : 0);
                return (
                  <Fragment key={key}>
                    {/* The tabs after Essentials hold every setting in its own place. */}
                    {key === firstAdvancedTab && (
                      <p
                        data-testid="settings-advanced-heading"
                        className="basis-full px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground"
                      >
                        {t('essentials_advancedHeading')}
                      </p>
                    )}
                    <TabsTrigger
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
                  </Fragment>
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
                        {renderCategoryHeader(categoryKey)}
                        {renderSections(categoryKey, new Set(fields))}
                      </div>
                    ))
                )}
              </section>
            ) : (
              Object.keys(tabs).map((categoryKey) => (
                <TabsContent key={categoryKey} value={categoryKey} className="mt-0">
                  {renderCategoryHeader(categoryKey)}
                  {renderSections(categoryKey)}
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
            {/* These hold settings, not bookmarks; bookmarks are exported in the manager. */}
            <Button type="button" variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              {t('newcomer_backUpSettings')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('newcomer_restoreSettings')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={`.${jsonFormat.extension}`}
              className="hidden"
              aria-label={t('newcomer_restoreSettings')}
              onChange={handleImport}
            />
            {shownValues.dataShowExport && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  openBookmarkExport().catch((error) => {
                    toast.error({
                      title: t('popup_openManagerFailed'),
                      description: getErrorMessage(error),
                    });
                  });
                }}
              >
                <BookMarked className="mr-2 h-4 w-4" />
                {t('tools_export')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingReset(true)}
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
      {explainingField && explainingFeature && (
        <PermissionDialog
          feature={explainingFeature}
          open
          onAllow={() => {
            setExplainingField(null);
            requestAndEnable(explainingField, explainingFeature);
          }}
          onCancel={() => setExplainingField(null)}
        />
      )}
      <ConfirmDialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title={t('settings_resetAllTitle')}
        description={t('settings_resetAllDescription')}
        confirmLabel={t('action_resetAll')}
        onConfirm={() => void handleReset()}
      />
      <Toaster />
    </div>
  );
};

export default OptionsPage;
