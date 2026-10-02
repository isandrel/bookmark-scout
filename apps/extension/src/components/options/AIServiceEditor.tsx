/**
 * Editor for one AI service: its name, key, model, and endpoint overrides. Credentials live in
 * browser.storage.local under the service id, are validated before they are persisted, and are
 * never logged. Every field saves when it loses focus, like the rest of Options.
 */

import { ChevronRight, ExternalLink, Eye, EyeOff, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Labels, descriptions, and placeholders of provider-specific connection fields. */
const EXTRA_FIELD_COPY: Record<
  AIProviderExtraField,
  { label: MessageKey; description: MessageKey; placeholder: string }
> = {
  organization: {
    label: 'options_organization',
    description: 'options_organizationDescription',
    placeholder: 'org-...',
  },
  project: {
    label: 'options_project',
    description: 'options_projectDescription',
    placeholder: 'proj_...',
  },
  resourceName: {
    label: 'options_resourceName',
    description: 'options_resourceNameDescription',
    placeholder: 'my-resource',
  },
  apiVersion: {
    label: 'options_apiVersion',
    description: 'options_apiVersionDescription',
    placeholder: 'v1',
  },
};

/** A field of the AI services panel and the text settings search matches it by. */
export type AIServicesSearchField = { advanced: boolean; text: string[] };

/** Fields of the AI services panel; advanced ones sit under More settings. */
export function getAIServicesSearchFields(): AIServicesSearchField[] {
  return [
    { advanced: false, text: [t('options_aiServices'), t('options_aiServicesDescription')] },
    { advanced: false, text: [t('options_apiKey'), t('options_apiKeyDescription')] },
    { advanced: false, text: [t('settings_aiModel')] },
    { advanced: false, text: [t('options_customModel'), t('options_customModelDescription')] },
    { advanced: true, text: [t('options_baseUrl'), t('options_baseUrlDescription')] },
    { advanced: true, text: [t('options_extraHeaders'), t('options_extraHeadersDescription')] },
    // Provider-specific fields match by label only; their descriptions mention other fields.
    ...Object.values(EXTRA_FIELD_COPY).map((copy) => ({ advanced: true, text: [t(copy.label)] })),
  ];
}

/** The panel fields a settings search matches. */
export function matchAIServicesSearch(query: string): AIServicesSearchField[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return getAIServicesSearchFields().filter(({ text }) =>
    text.some((item) => item.toLowerCase().includes(needle)),
  );
}

type FieldErrors = { apiKey?: string; baseUrl?: string; extraHeaders?: string };

type StoredFields = Required<Pick<StoredAIProviderConfig, 'apiKey' | 'baseUrl' | 'extraHeaders'>>;

const toFields = (stored: StoredAIProviderConfig): StoredFields => ({
  apiKey: stored.apiKey ?? '',
  baseUrl: stored.baseUrl ?? '',
  extraHeaders: stored.extraHeaders ?? '',
});

export function AIServiceEditor({
  service,
  showAdvanced = false,
}: {
  service: AIService;
  /** Opens More settings, e.g. when a settings search matched one of its fields. */
  showAdvanced?: boolean;
}) {
  const { toast } = useToast();
  const { provider } = service;
  const providerConfig = getProviderConfig(provider);
  const providerName = getLocalizedProviderName(provider);
  const extraFields = getProviderExtraFields(provider);
  const hasModelList = getProviderModelListStyle(provider) !== 'none';
  const docUrl = getProviderDocUrl(provider);
  const idPrefix = `ai-service-${service.id}`;

  const [name, setName] = useState(service.name);
  const [fields, setFields] = useState<StoredFields>({ apiKey: '', baseUrl: '', extraHeaders: '' });
  const [options, setOptions] = useState<Partial<Record<AIProviderExtraField, string>>>({});
  const [customModel, setCustomModel] = useState('');
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(showAdvanced);
  // A settings search that matches a field under More settings opens it.
  useEffect(() => {
    if (showAdvanced) setMoreOpen(true);
  }, [showAdvanced]);

  // The stored values last shown, to tell untouched fields from ones being edited.
  const shownRef = useRef<StoredAIProviderConfig>({});
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => setName(service.name), [service.name]);

  useEffect(() => {
    let active = true;
    setErrors({});
    shownRef.current = {};
    const show = (stored: StoredAIProviderConfig, keepEdits: boolean) => {
      const shown = toFields(shownRef.current);
      const next = toFields(stored);
      // A field the user is editing keeps their text; untouched fields follow the stored value.
      setFields((current) => {
        const merged = { ...current };
        for (const key of Object.keys(next) as (keyof StoredFields)[]) {
          if (!keepEdits || fieldsRef.current[key] === shown[key]) merged[key] = next[key];
        }
        return merged;
      });
      setOptions((current) => {
        const merged = { ...current };
        for (const field of extraFields) {
          const untouched =
            (optionsRef.current[field] ?? '') === (shownRef.current.options?.[field] ?? '');
          if (!keepEdits || untouched) merged[field] = stored.options?.[field] ?? '';
        }
        return merged;
      });
      shownRef.current = { ...stored };
    };
    void getStoredAIProviderConfig(service.id).then(async (stored) => {
      if (!active) return;
      show(stored, false);
      // Offer the list fetched earlier from the same endpoint.
      const endpoint = getProviderEndpoint(provider, stored.baseUrl, stored.options);
      const cached = await getCachedModelList(provider, endpoint);
      if (active && cached?.models.length) setDetectedModels(cached.models.map((m) => m.id));
    });
    // Another Options tab, or a reset, can change the stored values while this one is open.
    const unwatch = aiProviderConfigItem.watch((next) => {
      if (active) show(next?.[service.id] ?? {}, true);
    });
    return () => {
      active = false;
      unwatch();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: reload only for another service.
  }, [service.id, provider]);

  const modelOptions = useMemo(() => {
    const listed = detectedModels.length
      ? detectedModels.map((id) => ({ value: id, label: id }))
      : getModelsForProvider(provider).map((model) => ({ value: model.id, label: model.name }));
    // Keep the chosen model selectable even when the list no longer offers it.
    return service.model && !listed.some((option) => option.value === service.model)
      ? [{ value: service.model, label: service.model }, ...listed]
      : listed;
  }, [detectedModels, provider, service.model]);

  const setModel = (model: string) => {
    if (model !== service.model) void updateAIService(service.id, { model });
  };

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(service.name);
      return;
    }
    if (trimmed !== service.name) void updateAIService(service.id, { name: trimmed });
  };

  const validateApiKey = (key: string): string | undefined => {
    if (!key || !providerRequiresApiKey(provider) || !providerConfig?.api_key_pattern) {
      return undefined;
    }
    try {
      return new RegExp(providerConfig.api_key_pattern).test(key)
        ? undefined
        : t('options_apiKeyInvalidFormat', providerName);
    } catch {
      return undefined;
    }
  };

  /** Persists the valid fields; an invalid one keeps its stored value and never blocks the rest. */
  const saveFields = async (): Promise<boolean> => {
    const apiKey = fields.apiKey.trim();
    const baseUrl = fields.baseUrl.trim();
    const nextErrors: FieldErrors = {
      apiKey: validateApiKey(apiKey),
      baseUrl: baseUrl && !isValidProviderBaseUrl(baseUrl) ? t('options_baseUrlInvalid') : undefined,
      extraHeaders: isValidProviderExtraHeaders(fields.extraHeaders)
        ? undefined
        : t('options_extraHeadersInvalid'),
    };
    setErrors(nextErrors);
    // Write only valid fields that changed, so leaving one field never stores the others.
    const shown = shownRef.current;
    const changes: StoredAIProviderConfig = {};
    if (!nextErrors.apiKey && apiKey !== (shown.apiKey ?? '')) changes.apiKey = apiKey;
    if (!nextErrors.baseUrl && baseUrl !== (shown.baseUrl ?? '')) changes.baseUrl = baseUrl;
    const extraHeaders = fields.extraHeaders.trim();
    if (!nextErrors.extraHeaders && extraHeaders !== (shown.extraHeaders ?? '')) {
      changes.extraHeaders = extraHeaders;
    }
    const nextOptions = Object.fromEntries(
      extraFields.map((field) => [field, options[field]?.trim() ?? '']),
    );
    if (extraFields.some((field) => nextOptions[field] !== (shown.options?.[field] ?? ''))) {
      changes.options = nextOptions;
    }
    if (Object.keys(changes).length > 0) {
      await saveStoredAIProviderConfig(service.id, changes);
      shownRef.current = { ...shown, ...changes };
    }
    return !nextErrors.apiKey && !nextErrors.baseUrl && !nextErrors.extraHeaders;
  };

  const prepareRequest = async (): Promise<AISettings | null> => {
    // Ask for host access first, while the click still counts as a user gesture.
    const endpoint = getProviderEndpoint(
      provider,
      isValidProviderBaseUrl(fields.baseUrl) ? fields.baseUrl : undefined,
      options,
    );
    const accessRequest = requestProviderHostAccess(endpoint);
    const valid = await saveFields();
    await accessRequest;
    if (!valid) return null;
    return buildAISettingsFromService(service, true);
  };

  /** Keeps a fetched list for the model picker, here and after reloads. */
  const rememberModels = async (settings: AISettings, models: DetectedAIModel[]) => {
    const endpoint = getProviderEndpoint(provider, settings.baseUrl, settings.providerOptions);
    if (endpoint) await saveCachedModelList(provider, { endpoint, models, fetchedAt: Date.now() });
    const ids = models.map((model) => model.id);
    setDetectedModels(ids);
    if (!ids.includes(service.model)) setModel(ids[0]);
  };

  const verifyConnection = async () => {
    setIsVerifying(true);
    try {
      const settings = await prepareRequest();
      if (!settings) return;
      const check = await verifyAIService(settings);
      if (check.models.length > 0) {
        const endpoint = getProviderEndpoint(provider, settings.baseUrl, settings.providerOptions);
        if (endpoint) {
          await saveCachedModelList(provider, {
            endpoint,
            models: check.models,
            fetchedAt: Date.now(),
          });
        }
        setDetectedModels(check.models.map((model) => model.id));
      }
      const label = service.name;
      if (check.rateLimited) {
        toast({ title: t('toast_aiServiceVerified'), description: t('toast_aiServiceRateLimited', label) });
      } else if (check.modelListed === false) {
        toast({
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceModelMissing', [label, settings.model]),
        });
      } else {
        toast({
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceVerifiedDescription', label),
          variant: 'success',
        });
      }
    } catch (error) {
      toast({
        title: t('toast_aiServiceVerifyFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const refreshModels = async () => {
    setIsDetecting(true);
    try {
      const settings = await prepareRequest();
      if (!settings) return;
      const models = await listProviderModels(settings);
      if (models.length === 0) throw new Error(t('error_aiNoModels'));
      await rememberModels(settings, models);
      toast({
        title: t('toast_aiModelsRefreshed'),
        description: t('toast_aiModelsRefreshedDescription', [String(models.length), service.name]),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('toast_aiModelsRefreshFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const fieldError = (id: string, message?: string) =>
    message ? (
      <p id={id} role="alert" className="text-sm text-destructive-text">
        {message}
      </p>
    ) : null;

  const describedBy = (id: string, error?: string) =>
    error ? `${id}-description ${id}-error` : `${id}-description`;

  const textField = (
    key: keyof StoredFields | 'name',
    label: string,
    description: string,
    input: React.ReactNode,
    error?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${key}`} className="text-sm font-medium">
        {label}
      </Label>
      {input}
      <p id={`${idPrefix}-${key}-description`} className="text-xs text-muted-foreground">
        {description}
      </p>
      {fieldError(`${idPrefix}-${key}-error`, error)}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="ai-service-editor">
      {(isCatalogProvider(provider) || docUrl) && (
        <div className="space-y-1 text-sm text-muted-foreground" data-testid="ai-provider-info">
          {isCatalogProvider(provider) && <p>{t('options_catalogProviderHint')}</p>}
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('options_providerDocs')}
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {textField(
          'name',
          t('options_aiServiceName'),
          t('options_aiServiceNameDescription'),
          <Input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            aria-describedby={`${idPrefix}-name-description`}
            autoComplete="off"
          />,
        )}
        {textField(
          'apiKey',
          t('options_apiKey'),
          providerRequiresApiKey(provider)
            ? t('options_apiKeyDescription')
            : t('options_apiKeyOptionalDescription', providerName),
          <div className="relative">
            <Input
              id={`${idPrefix}-apiKey`}
              type={showApiKey ? 'text' : 'password'}
              autoComplete="off"
              value={fields.apiKey}
              onChange={(event) => setFields((current) => ({ ...current, apiKey: event.target.value }))}
              onBlur={() => void saveFields()}
              aria-describedby={describedBy(`${idPrefix}-apiKey`, errors.apiKey)}
              aria-invalid={Boolean(errors.apiKey)}
              placeholder={providerConfig?.api_key_placeholder || 'sk-...'}
              className="pr-9"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowApiKey(!showApiKey)}
              aria-label={showApiKey ? t('options_hideApiKey') : t('options_showApiKey')}
              aria-pressed={showApiKey}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>,
          errors.apiKey,
        )}
      </div>

      <div className="space-y-1.5">
        <Label id={`${idPrefix}-model-label`} className="text-sm font-medium">
          {t('settings_aiModel')}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            aria-labelledby={`${idPrefix}-model-label`}
            className="w-full sm:w-72"
            value={service.model}
            options={modelOptions}
            onValueChange={setModel}
            searchPlaceholder={t('select_searchPlaceholder')}
            emptyText={t('select_noMatches')}
          />
          {hasModelList && (
            <Button type="button" variant="outline" onClick={refreshModels} disabled={isDetecting}>
              <RefreshCw className="h-4 w-4" />
              {isDetecting ? t('options_refreshingModels') : t('options_refreshModels')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={verifyConnection} disabled={isVerifying}>
            <Wifi className="h-4 w-4" />
            {isVerifying ? t('options_verifyingService') : t('options_verifyService')}
          </Button>
        </div>
        {providerSupportsCustomModel(provider) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Label htmlFor={`${idPrefix}-customModel`} className="text-xs text-muted-foreground">
              {t('options_customModel')}
            </Label>
            <Input
              id={`${idPrefix}-customModel`}
              value={customModel}
              onChange={(event) => setCustomModel(event.target.value)}
              onBlur={() => {
                const trimmed = customModel.trim();
                if (trimmed) setModel(trimmed);
                setCustomModel('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              placeholder="model-id"
              aria-describedby={`${idPrefix}-customModel-description`}
              className="h-8 w-full sm:w-72"
            />
            <p
              id={`${idPrefix}-customModel-description`}
              className="w-full text-xs text-muted-foreground"
            >
              {t('options_customModelDescription')}
            </p>
          </div>
        )}
      </div>

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger className="group/more inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform group-data-[panel-open]/more:rotate-90"
          />
          {t('options_aiServiceMore')}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4 border-l pl-4">
          {textField(
            'baseUrl',
            t('options_baseUrl'),
            t('options_baseUrlDescription'),
            <Input
              id={`${idPrefix}-baseUrl`}
              type="url"
              value={fields.baseUrl}
              onChange={(event) => setFields((current) => ({ ...current, baseUrl: event.target.value }))}
              onBlur={() => void saveFields()}
              aria-describedby={describedBy(`${idPrefix}-baseUrl`, errors.baseUrl)}
              aria-invalid={Boolean(errors.baseUrl)}
              placeholder={getProviderEndpoint(provider, undefined, options) || 'https://api.example.com/v1'}
            />,
            errors.baseUrl,
          )}
          {extraFields.map((field) => {
            const copy = EXTRA_FIELD_COPY[field];
            const id = `${idPrefix}-option-${field}`;
            return (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={id} className="text-sm font-medium">
                  {t(copy.label)}
                </Label>
                <Input
                  id={id}
                  value={options[field] ?? ''}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, [field]: event.target.value }))
                  }
                  onBlur={() => void saveFields()}
                  aria-describedby={`${id}-description`}
                  autoComplete="off"
                  placeholder={copy.placeholder}
                />
                <p id={`${id}-description`} className="text-xs text-muted-foreground">
                  {t(copy.description)}
                </p>
              </div>
            );
          })}
          {textField(
            'extraHeaders',
            t('options_extraHeaders'),
            t('options_extraHeadersDescription'),
            <Input
              id={`${idPrefix}-extraHeaders`}
              value={fields.extraHeaders}
              onChange={(event) =>
                setFields((current) => ({ ...current, extraHeaders: event.target.value }))
              }
              onBlur={() => void saveFields()}
              aria-describedby={describedBy(`${idPrefix}-extraHeaders`, errors.extraHeaders)}
              aria-invalid={Boolean(errors.extraHeaders)}
              placeholder='{"HTTP-Referer":"https://example.com"}'
            />,
            errors.extraHeaders,
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
