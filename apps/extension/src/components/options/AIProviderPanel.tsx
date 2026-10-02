/**
 * AI provider credentials and endpoint overrides. Values live in browser.storage.local, are
 * validated before they are persisted, and are never logged.
 */

import { Eye, EyeOff, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type AIProviderPanelField =
  | 'apiKey'
  | 'baseUrl'
  | 'customModel'
  | 'extraHeaders'
  | AIProviderExtraField;

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

/** The panel fields shown for `provider`, with the text settings search matches against. */
export function getAIProviderPanelFields(
  provider: AIProvider,
): { field: AIProviderPanelField; text: string[] }[] {
  const fields: { field: AIProviderPanelField; text: string[] }[] = [
    {
      field: 'apiKey',
      text: [
        t('options_apiKey'),
        providerRequiresApiKey(provider)
          ? t('options_apiKeyDescription')
          : t('options_apiKeyOptionalDescription', getLocalizedProviderName(provider)),
      ],
    },
    { field: 'baseUrl', text: [t('options_baseUrl'), t('options_baseUrlDescription')] },
    {
      field: 'customModel',
      text: [t('options_customModel'), t('options_customModelDescription')],
    },
    ...getProviderExtraFields(provider).map((field) => ({
      field,
      text: [t(EXTRA_FIELD_COPY[field].label), t(EXTRA_FIELD_COPY[field].description)],
    })),
    {
      field: 'extraHeaders',
      text: [t('options_extraHeaders'), t('options_extraHeadersDescription')],
    },
  ];
  return fields.filter(
    ({ field }) => field !== 'customModel' || providerSupportsCustomModel(provider),
  );
}

type AIProviderPanelProps = {
  provider: AIProvider;
  model: string;
  /** `fromCache` marks a list restored from storage, which must not change the chosen model. */
  onModelsDetected: (
    provider: AIProvider,
    modelIds: string[],
    options?: { fromCache?: boolean },
  ) => void;
  /** Limits the panel to these fields, e.g. settings search matches. Defaults to every field. */
  visibleFields?: AIProviderPanelField[];
};

type ProviderFieldErrors = {
  apiKey?: string;
  baseUrl?: string;
  extraHeaders?: string;
};

export function AIProviderPanel({
  provider,
  model,
  onModelsDetected,
  visibleFields,
}: AIProviderPanelProps) {
  const { toast } = useToast();
  const providerConfig = getProviderConfig(provider);
  const providerName = getLocalizedProviderName(provider);

  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [extraHeaders, setExtraHeaders] = useState('');
  const [extraOptions, setExtraOptions] = useState<NonNullable<StoredAIProviderConfig['options']>>(
    {},
  );
  const [errors, setErrors] = useState<ProviderFieldErrors>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  // Latest field text for the storage watcher, which outlives a single render.
  const apiKeyRef = useRef(apiKey);
  const baseUrlRef = useRef(baseUrl);
  const customModelRef = useRef(customModel);
  const extraHeadersRef = useRef(extraHeaders);
  apiKeyRef.current = apiKey;
  baseUrlRef.current = baseUrl;
  customModelRef.current = customModel;
  extraHeadersRef.current = extraHeaders;
  const extraOptionsRef = useRef(extraOptions);
  extraOptionsRef.current = extraOptions;
  const onModelsDetectedRef = useRef(onModelsDetected);
  onModelsDetectedRef.current = onModelsDetected;

  // The stored values last shown, to tell untouched fields from ones being edited.
  const shownRef = useRef<StoredAIProviderConfig>({});

  useEffect(() => {
    let active = true;
    setErrors({});
    shownRef.current = {};
    const show = (stored: StoredAIProviderConfig, keepEdits: boolean) => {
      const shown = shownRef.current;
      // A field the user is editing keeps their text; untouched fields follow the stored value.
      const follow = (
        field: 'apiKey' | 'baseUrl' | 'customModel' | 'extraHeaders',
        setter: (value: string) => void,
        current: string,
      ) => {
        if (!keepEdits || current === (shown[field] ?? '')) setter(stored[field] ?? '');
      };
      follow('apiKey', setApiKey, apiKeyRef.current);
      follow('baseUrl', setBaseUrl, baseUrlRef.current);
      follow('customModel', setCustomModel, customModelRef.current);
      follow('extraHeaders', setExtraHeaders, extraHeadersRef.current);
      setExtraOptions((current) => {
        const next = { ...current };
        for (const field of getProviderExtraFields(provider)) {
          const unchanged = (current[field] ?? '') === (shown.options?.[field] ?? '');
          if (!keepEdits || unchanged) next[field] = stored.options?.[field] ?? '';
        }
        return next;
      });
      setSavedApiKey(stored.apiKey ?? '');
      shownRef.current = { ...stored };
    };
    void getStoredAIProviderConfig(provider).then(async (stored) => {
      if (!active) return;
      show(stored, false);
      // Offer the list fetched earlier from the same endpoint, without changing the chosen model.
      const endpoint = getProviderEndpoint(provider, stored.baseUrl, stored.options);
      const cached = await getCachedModelList(provider, endpoint);
      if (active && cached?.models.length) {
        onModelsDetectedRef.current(
          provider,
          cached.models.map((detected) => detected.id),
          { fromCache: true },
        );
      }
    });
    // Another Options tab, or a reset, can change the stored values while this one is open.
    const unwatch = aiProviderConfigItem.watch((next) => {
      if (active) show(next?.[provider] ?? {}, true);
    });
    return () => {
      active = false;
      unwatch();
    };
  }, [provider]);

  const setFieldError = (field: keyof ProviderFieldErrors, message?: string) =>
    setErrors((current) => ({ ...current, [field]: message }));

  const validateApiKey = (key: string): string | undefined => {
    if (!key.trim() || !providerRequiresApiKey(provider) || !providerConfig?.api_key_pattern) {
      return undefined;
    }
    try {
      return new RegExp(providerConfig.api_key_pattern).test(key.trim())
        ? undefined
        : t('options_apiKeyInvalidFormat', providerName);
    } catch {
      return undefined;
    }
  };

  /** Persist the key only when it is valid; returns whether the stored key is now usable. */
  const saveApiKey = async (): Promise<boolean> => {
    const key = apiKey.trim();
    const error = validateApiKey(key);
    setFieldError('apiKey', error);
    if (error) return false;
    if (key === savedApiKey) return true;

    // Saved silently like every other setting; the field itself shows the value.
    await saveStoredAIProviderConfig(provider, { apiKey: key });
    setSavedApiKey(key);
    return true;
  };

  /** Persist the valid ones of Base URL, custom model, and headers; never touches the API key. */
  const saveOverrides = async (): Promise<boolean> => {
    const trimmedBaseUrl = baseUrl.trim();
    const baseUrlError =
      trimmedBaseUrl && !isValidProviderBaseUrl(trimmedBaseUrl)
        ? t('options_baseUrlInvalid')
        : undefined;
    const headersError = isValidProviderExtraHeaders(extraHeaders)
      ? undefined
      : t('options_extraHeadersInvalid');
    setErrors((current) => ({
      ...current,
      baseUrl: baseUrlError,
      extraHeaders: headersError,
    }));
    // Save every valid field; an invalid one keeps its stored value and never blocks the rest.
    const options = Object.fromEntries(
      getProviderExtraFields(provider).map((field) => [field, extraOptions[field]?.trim() ?? '']),
    );
    await saveStoredAIProviderConfig(provider, {
      customModel: customModel.trim(),
      options,
      ...(baseUrlError ? {} : { baseUrl: trimmedBaseUrl }),
      ...(headersError ? {} : { extraHeaders: extraHeaders.trim() }),
    });
    return !baseUrlError && !headersError;
  };

  const prepareRequest = async (): Promise<AISettings | null> => {
    // Ask for host access first, while the click still counts as a user gesture.
    const endpoint = getProviderEndpoint(
      provider,
      isValidProviderBaseUrl(baseUrl) ? baseUrl : undefined,
      extraOptions,
    );
    const accessRequest = requestProviderHostAccess(endpoint);
    const keyValid = await saveApiKey();
    const overridesValid = await saveOverrides();
    await accessRequest;
    if (!keyValid || !overridesValid) return null;
    return buildAISettingsFromProvider(provider, model, true);
  };

  /** Keep a fetched list for the model picker, here and after reloads. */
  const rememberModels = async (settings: AISettings, models: DetectedAIModel[]) => {
    const endpoint = getProviderEndpoint(provider, settings.baseUrl, settings.providerOptions);
    if (endpoint) await saveCachedModelList(provider, { endpoint, models, fetchedAt: Date.now() });
    onModelsDetected(
      provider,
      models.map((detected) => detected.id),
    );
  };

  const verifyConnection = async () => {
    setIsVerifying(true);
    try {
      const settings = await prepareRequest();
      if (!settings) return;
      const check = await verifyAIService(settings);
      if (check.models.length > 0) await rememberModels(settings, check.models);
      const modelId = settings.customModel?.trim() || settings.model;
      if (check.rateLimited) {
        toast({
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceRateLimited', providerName),
        });
      } else if (check.modelListed === false) {
        toast({
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceModelMissing', [providerName, modelId]),
        });
      } else {
        toast({
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceVerifiedDescription', providerName),
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
        description: t('toast_aiModelsRefreshedDescription', [String(models.length), providerName]),
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

  const hasModelList = getProviderModelListStyle(provider) !== 'none';
  const extraFields = getProviderExtraFields(provider);

  const apiKeyDescription = providerRequiresApiKey(provider)
    ? t('options_apiKeyDescription')
    : t('options_apiKeyOptionalDescription', providerName);

  const isVisible = (field: AIProviderPanelField) =>
    !visibleFields || visibleFields.includes(field);
  const showEndpointFields =
    isVisible('baseUrl') ||
    isVisible('customModel') ||
    isVisible('extraHeaders') ||
    extraFields.some(isVisible);

  const fieldError = (id: string, message?: string) =>
    message ? (
      <p id={id} role="alert" className="text-sm text-destructive-text">
        {message}
      </p>
    ) : null;

  return (
    <>
      {isVisible('apiKey') && (
        <div className="flex flex-col gap-3 rounded-lg border border-transparent bg-card p-4 transition-colors hover:border-border hover:bg-accent/50 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1 sm:pr-4">
            <Label htmlFor="ai-api-key" className="text-base font-medium">
              {t('options_apiKey')}
            </Label>
            <p id="ai-api-key-description" className="text-sm text-muted-foreground">
              {apiKeyDescription}
            </p>
            {fieldError('ai-api-key-error', errors.apiKey)}
          </div>
          <div className="relative w-full sm:w-[240px]">
            <Input
              id="ai-api-key"
              type={showApiKey ? 'text' : 'password'}
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onBlur={() => void saveApiKey()}
              aria-describedby={
                errors.apiKey ? 'ai-api-key-description ai-api-key-error' : 'ai-api-key-description'
              }
              aria-invalid={Boolean(errors.apiKey)}
              placeholder={providerConfig?.api_key_placeholder || 'sk-...'}
              className="pr-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-8"
              onClick={() => setShowApiKey(!showApiKey)}
              aria-label={showApiKey ? t('options_hideApiKey') : t('options_showApiKey')}
              aria-pressed={showApiKey}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {showEndpointFields && (
        <div className="space-y-3 rounded-lg border border-transparent bg-card p-4 hover:border-border">
          {isVisible('baseUrl') && (
            <>
              <div className="space-y-1">
                <Label htmlFor="ai-base-url" className="text-base font-medium">
                  {t('options_baseUrl')}
                </Label>
                <p id="ai-base-url-description" className="text-sm text-muted-foreground">
                  {t('options_baseUrlDescription')}
                </p>
                {fieldError('ai-base-url-error', errors.baseUrl)}
              </div>
              <Input
                id="ai-base-url"
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                onBlur={() => void saveOverrides()}
                aria-describedby={
                  errors.baseUrl
                    ? 'ai-base-url-description ai-base-url-error'
                    : 'ai-base-url-description'
                }
                aria-invalid={Boolean(errors.baseUrl)}
                placeholder={providerConfig?.base_url || 'https://api.example.com/v1'}
              />
            </>
          )}

          {providerSupportsCustomModel(provider) && isVisible('customModel') && (
            <>
              <div className="space-y-1">
                <Label htmlFor="ai-custom-model" className="text-base font-medium">
                  {t('options_customModel')}
                </Label>
                <p id="ai-custom-model-description" className="text-sm text-muted-foreground">
                  {t('options_customModelDescription')}
                </p>
              </div>
              <Input
                id="ai-custom-model"
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                onBlur={() => void saveOverrides()}
                aria-describedby="ai-custom-model-description"
                placeholder="gpt-4o-mini"
              />
            </>
          )}

          {extraFields.filter(isVisible).map((field) => {
            const copy = EXTRA_FIELD_COPY[field];
            const id = `ai-option-${field}`;
            return (
              <div key={field} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={id} className="text-base font-medium">
                    {t(copy.label)}
                  </Label>
                  <p id={`${id}-description`} className="text-sm text-muted-foreground">
                    {t(copy.description)}
                  </p>
                </div>
                <Input
                  id={id}
                  value={extraOptions[field] ?? ''}
                  onChange={(event) =>
                    setExtraOptions((current) => ({ ...current, [field]: event.target.value }))
                  }
                  onBlur={() => void saveOverrides()}
                  aria-describedby={`${id}-description`}
                  autoComplete="off"
                  placeholder={copy.placeholder}
                />
              </div>
            );
          })}

          {isVisible('extraHeaders') && (
            <>
              <div className="space-y-1">
                <Label htmlFor="ai-extra-headers" className="text-base font-medium">
                  {t('options_extraHeaders')}
                </Label>
                <p id="ai-extra-headers-description" className="text-sm text-muted-foreground">
                  {t('options_extraHeadersDescription')}
                </p>
                {fieldError('ai-extra-headers-error', errors.extraHeaders)}
              </div>
              <Input
                id="ai-extra-headers"
                value={extraHeaders}
                onChange={(event) => setExtraHeaders(event.target.value)}
                onBlur={() => void saveOverrides()}
                aria-describedby={
                  errors.extraHeaders
                    ? 'ai-extra-headers-description ai-extra-headers-error'
                    : 'ai-extra-headers-description'
                }
                aria-invalid={Boolean(errors.extraHeaders)}
                placeholder='{"HTTP-Referer":"https://example.com"}'
              />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {hasModelList && (
              <Button
                type="button"
                variant="outline"
                onClick={refreshModels}
                disabled={isDetecting}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {isDetecting ? t('options_refreshingModels') : t('options_refreshModels')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={verifyConnection}
              disabled={isVerifying}
            >
              <Wifi className="mr-2 h-4 w-4" />
              {isVerifying ? t('options_verifyingService') : t('options_verifyService')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
