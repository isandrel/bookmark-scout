/**
 * AI provider credentials and endpoint overrides. Values live in browser.storage.local, are
 * validated before they are persisted, and are never logged.
 */

import { Eye, EyeOff, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

type AIProviderPanelProps = {
  provider: AIProvider;
  model: string;
  onModelsDetected: (provider: AIProvider, modelIds: string[]) => void;
};

type ProviderFieldErrors = {
  apiKey?: string;
  baseUrl?: string;
  extraHeaders?: string;
};

export function AIProviderPanel({ provider, model, onModelsDetected }: AIProviderPanelProps) {
  const { toast } = useToast();
  const providerConfig = getProviderConfig(provider);
  const providerName = getLocalizedProviderName(provider);

  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [extraHeaders, setExtraHeaders] = useState('');
  const [errors, setErrors] = useState<ProviderFieldErrors>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    let active = true;
    setErrors({});
    void getStoredAIProviderConfig(provider).then((stored) => {
      if (!active) return;
      setApiKey(stored.apiKey ?? '');
      setSavedApiKey(stored.apiKey ?? '');
      setBaseUrl(stored.baseUrl ?? '');
      setCustomModel(stored.customModel ?? '');
      setExtraHeaders(stored.extraHeaders ?? '');
    });
    return () => {
      active = false;
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

    await saveStoredAIProviderConfig(provider, { apiKey: key });
    setSavedApiKey(key);
    if (key) {
      toast({
        title: `✓ ${t('toast_apiKeySaved')}`,
        description: t('toast_apiKeySavedDescription'),
        variant: 'success',
      });
    }
    return true;
  };

  /** Persist Base URL, custom model, and headers; never touches the API key. */
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
    if (baseUrlError || headersError) return false;

    await saveStoredAIProviderConfig(provider, {
      baseUrl: trimmedBaseUrl,
      customModel: customModel.trim(),
      extraHeaders: extraHeaders.trim(),
    });
    return true;
  };

  const prepareRequest = async (): Promise<AISettings | null> => {
    // Ask for host access first, while the click still counts as a user gesture.
    const endpoint = isValidProviderBaseUrl(baseUrl)
      ? baseUrl.trim()
      : getProviderEndpoint(provider, undefined);
    const accessRequest = requestProviderHostAccess(endpoint);
    const keyValid = await saveApiKey();
    const overridesValid = await saveOverrides();
    await accessRequest;
    if (!keyValid || !overridesValid) return null;
    return buildAISettingsFromProvider(provider, model, true);
  };

  const verifyConnection = async () => {
    setIsVerifying(true);
    try {
      const settings = await prepareRequest();
      if (!settings) return;
      await verifyAIService(settings);
      toast({
        title: t('toast_aiServiceVerified'),
        description: t('toast_aiServiceVerifiedDescription', providerName),
        variant: 'success',
      });
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
      const models = await detectAIModels(settings);
      if (models.length === 0) throw new Error(t('error_aiNoModels'));
      onModelsDetected(
        provider,
        models.map((detected) => detected.id),
      );
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

  const apiKeyDescription = providerRequiresApiKey(provider)
    ? t('options_apiKeyDescription')
    : t('options_apiKeyOptionalDescription', providerName);

  const fieldError = (id: string, message?: string) =>
    message ? (
      <p id={id} role="alert" className="text-sm text-destructive">
        {message}
      </p>
    ) : null;

  return (
    <>
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

      <div className="space-y-3 rounded-lg border border-transparent bg-card p-4 hover:border-border">
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
            errors.baseUrl ? 'ai-base-url-description ai-base-url-error' : 'ai-base-url-description'
          }
          aria-invalid={Boolean(errors.baseUrl)}
          placeholder={providerConfig?.base_url || 'https://api.example.com/v1'}
        />

        {providerSupportsCustomModel(provider) && (
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={refreshModels} disabled={isDetecting}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {isDetecting ? t('options_refreshingModels') : t('options_refreshModels')}
          </Button>
          <Button type="button" variant="outline" onClick={verifyConnection} disabled={isVerifying}>
            <Wifi className="mr-2 h-4 w-4" />
            {isVerifying ? t('options_verifyingService') : t('options_verifyService')}
          </Button>
        </div>
      </div>
    </>
  );
}
