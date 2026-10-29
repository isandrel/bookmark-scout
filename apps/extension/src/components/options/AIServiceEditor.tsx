/**
 * Editor for one AI service: its name, key, model, and endpoint overrides. Credentials live in
 * browser.storage.local under the service id, are validated before they are persisted, and are
 * never logged. Every field saves when it loses focus, like the rest of Options.
 */

import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  RefreshCw,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { AI_PROVIDER_EXTRA_FIELDS } from '@/lib/config/ai-provider-schema';

/** Example values shown as placeholders, from config/ai/provider-fields.toml. */
const fieldExamples = readConfig(
  'ai/provider-fields',
  z.strictObject({
    base_url: z.string(),
    extra_headers: z.string(),
    extra_fields: z.record(z.enum(AI_PROVIDER_EXTRA_FIELDS), z.string()),
  }),
);

/** Labels and descriptions of provider-specific connection fields. */
const EXTRA_FIELD_COPY: Record<
  AIProviderExtraField,
  { label: MessageKey; description: MessageKey }
> = {
  organization: {
    label: 'options_organization',
    description: 'options_organizationDescription',
  },
  project: { label: 'options_project', description: 'options_projectDescription' },
  resourceName: {
    label: 'options_resourceName',
    description: 'options_resourceNameDescription',
  },
  apiVersion: { label: 'options_apiVersion', description: 'options_apiVersionDescription' },
};

/**
 * A field of the AI services panel and the text settings search matches it by, label first.
 * `editor` fields are inside a hosted service's editor, so they show only while one is open.
 */
export type AIServicesSearchField = { advanced: boolean; editor: boolean; text: string[] };

type SearchFieldSpec = { advanced: boolean; editor: boolean; keys: readonly MessageKey[] };

type SearchFieldId =
  | 'panel'
  | 'apiKey'
  | 'requiresApiKey'
  | 'model'
  | 'customModel'
  | 'baseUrl'
  | 'extraHeaders'
  | AIProviderExtraField;

/** The panel's searchable fields, in display order; advanced ones sit under More settings. */
const SEARCH_FIELDS: Record<SearchFieldId, SearchFieldSpec> = {
  panel: {
    advanced: false,
    editor: false,
    keys: ['options_aiServices', 'options_aiServicesDescription'],
  },
  apiKey: { advanced: false, editor: true, keys: ['options_apiKey', 'options_apiKeyDescription'] },
  requiresApiKey: { advanced: false, editor: true, keys: ['options_requiresApiKey'] },
  model: { advanced: false, editor: true, keys: ['settings_aiModel'] },
  customModel: {
    advanced: false,
    editor: true,
    keys: ['options_customModel', 'options_customModelDescription'],
  },
  baseUrl: {
    advanced: true,
    editor: true,
    keys: ['options_baseUrl', 'options_baseUrlDescription'],
  },
  extraHeaders: {
    advanced: true,
    editor: true,
    keys: ['options_extraHeaders', 'options_extraHeadersDescription'],
  },
  // Provider-specific fields match by label only; their descriptions mention other fields.
  ...(Object.fromEntries(
    Object.entries(EXTRA_FIELD_COPY).map(([field, copy]): [string, SearchFieldSpec] => [
      field,
      { advanced: true, editor: true, keys: [copy.label] },
    ]),
  ) as Record<AIProviderExtraField, SearchFieldSpec>),
};

/** Fields of the AI services panel, in the order the panel shows them. */
export function getAIServicesSearchFields(): AIServicesSearchField[] {
  return Object.values(SEARCH_FIELDS).map(({ keys, ...field }) => ({
    ...field,
    text: keys.map((key) => t(key)),
  }));
}

/** The panel fields a settings search matches. */
export function matchAIServicesSearch(query: TextQuery | undefined): AIServicesSearchField[] {
  if (!query) return [];
  return getAIServicesSearchFields().filter(({ text }) => matchesEveryTerm(text, query));
}

/**
 * One text of a searchable panel field (`part` 0 is its label), marked where a settings search
 * matched that field.
 */
export function AIServicesSearchText({ field, part = 0 }: { field: SearchFieldId; part?: number }) {
  const { keys } = SEARCH_FIELDS[field];
  return <SearchMatchText text={t(keys[part])} within={keys.map((key) => t(key))} />;
}

type FieldErrors = { apiKey?: string; baseUrl?: string; extraHeaders?: string };

type StoredFields = Required<Pick<StoredAIProviderConfig, 'apiKey' | 'baseUrl' | 'extraHeaders'>>;

const toFields = (stored: StoredAIProviderConfig): StoredFields => ({
  apiKey: stored.apiKey ?? '',
  baseUrl: stored.baseUrl ?? '',
  extraHeaders: stored.extraHeaders ?? '',
});

type ConnectionStatusValue = {
  tone: 'success' | 'warning' | 'error';
  title: string;
  description: string;
};

const CONNECTION_STATUS_STYLES = {
  success: { icon: CircleCheck, className: 'border-success/30 bg-success-wash text-success' },
  warning: { icon: TriangleAlert, className: 'border-warning/30 bg-warning-wash text-warning' },
  error: {
    icon: CircleAlert,
    className: 'border-destructive/30 bg-destructive-wash text-destructive-text',
  },
} as const;

/**
 * The result of Refresh Models or Verify Service, shown next to the buttons that produced it.
 * While a new check runs, the last result stays in place, dimmed, so the form below does not
 * jump up and back down.
 */
function ConnectionStatus({
  status,
  checking,
}: {
  status: ConnectionStatusValue | null;
  checking: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={checking}
      data-testid="ai-service-status"
      data-stale={checking && status ? '' : undefined}
    >
      {status &&
        (() => {
          const { icon: Icon, className } = CONNECTION_STATUS_STYLES[status.tone];
          return (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-opacity ${className} ${checking ? 'opacity-50' : ''}`}
            >
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="font-medium">{status.title}</p>
                <p className="text-foreground/80">{status.description}</p>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

/**
 * A button label that switches to its busy text without changing the button's width: both texts
 * share one grid cell and only the current one is visible, so the buttons beside it stay put.
 */
function SteadyLabel({ busy, idle, busyText }: { busy: boolean; idle: string; busyText: string }) {
  return (
    <span className="inline-grid">
      <span className={`col-start-1 row-start-1 ${busy ? 'invisible' : ''}`}>{idle}</span>
      <span className={`col-start-1 row-start-1 ${busy ? '' : 'invisible'}`}>{busyText}</span>
    </span>
  );
}

/** The service's name, saved when the field loses focus; an empty name keeps the old one. */
function AIServiceNameField({ service }: { service: AIService }) {
  const [name, setName] = useState(service.name);
  useEffect(() => setName(service.name), [service.name]);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(service.name);
      return;
    }
    if (trimmed !== service.name) void updateAIService(service.id, { name: trimmed });
  };

  return (
    <Field
      id={`ai-service-${service.id}-name`}
      label={t('options_aiServiceName')}
      description={t('options_aiServiceNameDescription')}
    >
      {(control) => (
        <Input
          {...control}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          autoComplete="off"
        />
      )}
    </Field>
  );
}

/**
 * Editor for the browser's built-in model: no key, model, or endpoint, only its name and the
 * model's state with the download (`BuiltinAIModelStatus`).
 */
export function BuiltinAIServiceEditor({ service }: { service: AIService }) {
  return (
    <div className="space-y-4" data-testid="ai-service-editor">
      <div className="sm:w-1/2">
        <AIServiceNameField service={service} />
      </div>
      <BuiltinAIModelStatus />
    </div>
  );
}

export function AIServiceEditor({
  service,
  showAdvanced = false,
}: {
  service: AIService;
  /** Opens More settings, e.g. when a settings search matched one of its fields. */
  showAdvanced?: boolean;
}) {
  const { provider } = service;
  const providerConfig = getProviderConfig(provider);
  const providerName = getLocalizedProviderName(provider);
  const extraFields = getProviderExtraFields(provider);
  const hasModelList = getProviderModelListStyle(provider) !== 'none';
  const docUrl = getProviderDocUrl(provider);
  const keyUrl = getProviderKeyUrl(provider);
  const idPrefix = `ai-service-${service.id}`;
  const requiresKey = serviceRequiresApiKey(service);
  // The user turned the key off for a provider that normally needs one.
  const keyTurnedOff = !requiresKey && providerRequiresApiKey(provider);

  const [fields, setFields] = useState<StoredFields>({ apiKey: '', baseUrl: '', extraHeaders: '' });
  const [options, setOptions] = useState<Partial<Record<AIProviderExtraField, string>>>({});
  const [customModel, setCustomModel] = useState('');
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<ConnectionStatusValue | null>(null);
  // A result describes the provider as it was checked; switching providers makes it stale. A model
  // change does not, since Refresh Models itself picks a model.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clears on a provider change only
  useEffect(() => setStatus(null), [provider]);
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

  // Reload only for another service; extraFields derives from provider.
  // biome-ignore lint/correctness/useExhaustiveDependencies: extraFields follows provider
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
      const cached = await getCachedModelList(service.id, endpoint);
      if (active && cached?.models.length) setDetectedModels(cached.models.map((m) => m.id));
    });
    // Another Options tab, or a reset, can change the stored values while this one is open.
    const unwatch = aiProviderConfigValue.watch((next) => {
      if (active) show(next[service.id] ?? {}, true);
    });
    return () => {
      active = false;
      unwatch();
    };
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

  const validateApiKey = (key: string): string | undefined => {
    if (!key || !requiresKey || !providerConfig?.api_key_pattern) {
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
      baseUrl:
        baseUrl && !isValidProviderBaseUrl(baseUrl) ? t('options_baseUrlInvalid') : undefined,
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
    if (endpoint)
      await saveCachedModelList(service.id, { endpoint, models, fetchedAt: Date.now() });
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
          await saveCachedModelList(service.id, {
            endpoint,
            models: check.models,
            fetchedAt: Date.now(),
          });
        }
        setDetectedModels(check.models.map((model) => model.id));
      }
      const label = service.name;
      if (check.rateLimited) {
        setStatus({
          tone: 'success',
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceRateLimited', label),
        });
      } else if (check.modelListed === false) {
        setStatus({
          tone: 'warning',
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceModelMissing', [label, settings.model]),
        });
      } else {
        setStatus({
          tone: 'success',
          title: t('toast_aiServiceVerified'),
          description: t('toast_aiServiceVerifiedDescription', label),
        });
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        title: t('toast_aiServiceVerifyFailed'),
        description: getErrorMessage(error),
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
      setStatus({
        tone: 'success',
        title: t('toast_aiModelsRefreshed'),
        description: t('toast_aiModelsRefreshedDescription', [String(models.length), service.name]),
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        title: t('toast_aiModelsRefreshFailed'),
        description: getErrorMessage(error),
      });
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="ai-service-editor">
      {(isCatalogProvider(provider) || docUrl) && (
        <div className="space-y-1 text-sm text-muted-foreground" data-testid="ai-provider-info">
          {isCatalogProvider(provider) && <p>{t('options_catalogProviderHint')}</p>}
          {docUrl && (
            <UrlLink
              href={docUrl}
              className="inline-flex items-center gap-1 text-primary underline-offset-4"
            >
              {t('options_providerDocs')}
            </UrlLink>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <AIServiceNameField service={service} />
        <Field
          id={`${idPrefix}-apiKey`}
          label={<AIServicesSearchText field="apiKey" />}
          description={
            requiresKey ? (
              <AIServicesSearchText field="apiKey" part={1} />
            ) : keyTurnedOff ? (
              t('options_apiKeyTurnedOffDescription')
            ) : (
              t('options_apiKeyOptionalDescription', providerName)
            )
          }
          error={errors.apiKey}
        >
          {(control) => (
            <div className="relative">
              <Input
                {...control}
                type={showApiKey ? 'text' : 'password'}
                autoComplete="off"
                value={fields.apiKey}
                onChange={(event) =>
                  setFields((current) => ({ ...current, apiKey: event.target.value }))
                }
                onBlur={() => void saveFields()}
                placeholder={
                  providerConfig?.api_key_placeholder ||
                  t(
                    requiresKey
                      ? 'options_apiKeyRequiredPlaceholder'
                      : 'options_apiKeyOptionalPlaceholder',
                  )
                }
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
            </div>
          )}
        </Field>
        {/* Where the key comes from, for providers whose file names the page. */}
        {keyUrl && (
          <UrlLink
            href={keyUrl}
            data-testid="ai-provider-key-link"
            className="-mt-2 inline-flex items-center gap-1 justify-self-start text-sm text-primary sm:col-start-2"
          >
            {t('aiOnboard_getKey', providerName)}
          </UrlLink>
        )}
        <div className="flex items-center gap-2 sm:col-start-2">
          <Switch
            id={`${idPrefix}-requiresApiKey`}
            checked={requiresKey}
            onCheckedChange={(checked) => void setAIServiceRequiresApiKey(service, checked)}
            data-testid="ai-service-requires-key"
          />
          <Label htmlFor={`${idPrefix}-requiresApiKey`} className="text-sm">
            <AIServicesSearchText field="requiresApiKey" />
          </Label>
          <SettingHelp label={t('options_requiresApiKey')} help={t('options_requiresApiKeyHelp')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label id={`${idPrefix}-model-label`} className="text-sm font-medium">
          <AIServicesSearchText field="model" />
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
              <RefreshCw className={`h-4 w-4 ${isDetecting ? 'motion-safe:animate-spin' : ''}`} />
              <SteadyLabel
                busy={isDetecting}
                idle={t('options_refreshModels')}
                busyText={t('options_refreshingModels')}
              />
            </Button>
          )}
          <Button type="button" variant="outline" onClick={verifyConnection} disabled={isVerifying}>
            <Wifi className="h-4 w-4" />
            <SteadyLabel
              busy={isVerifying}
              idle={t('options_verifyService')}
              busyText={t('options_verifyingService')}
            />
          </Button>
        </div>
        <ConnectionStatus status={status} checking={isDetecting || isVerifying} />
        {providerSupportsCustomModel(provider) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Label htmlFor={`${idPrefix}-customModel`} className="text-xs text-muted-foreground">
              <AIServicesSearchText field="customModel" />
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
              placeholder={t('options_customModelPlaceholder')}
              aria-describedby={`${idPrefix}-customModel-description`}
              className="h-8 w-full sm:w-72"
            />
            <p
              id={`${idPrefix}-customModel-description`}
              className="w-full text-xs text-muted-foreground"
            >
              <AIServicesSearchText field="customModel" part={1} />
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
          <Field
            id={`${idPrefix}-baseUrl`}
            label={<AIServicesSearchText field="baseUrl" />}
            description={<AIServicesSearchText field="baseUrl" part={1} />}
            error={errors.baseUrl}
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                value={fields.baseUrl}
                onChange={(event) =>
                  setFields((current) => ({ ...current, baseUrl: event.target.value }))
                }
                onBlur={() => void saveFields()}
                placeholder={
                  getProviderEndpoint(provider, undefined, options) || fieldExamples.base_url
                }
              />
            )}
          </Field>
          {extraFields.map((field) => (
            <Field
              key={field}
              id={`${idPrefix}-option-${field}`}
              label={<AIServicesSearchText field={field} />}
              description={t(EXTRA_FIELD_COPY[field].description)}
            >
              {(control) => (
                <Input
                  {...control}
                  value={options[field] ?? ''}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, [field]: event.target.value }))
                  }
                  onBlur={() => void saveFields()}
                  autoComplete="off"
                  placeholder={fieldExamples.extra_fields[field]}
                />
              )}
            </Field>
          ))}
          <Field
            id={`${idPrefix}-extraHeaders`}
            label={<AIServicesSearchText field="extraHeaders" />}
            description={<AIServicesSearchText field="extraHeaders" part={1} />}
            error={errors.extraHeaders}
          >
            {(control) => (
              <Input
                {...control}
                value={fields.extraHeaders}
                onChange={(event) =>
                  setFields((current) => ({ ...current, extraHeaders: event.target.value }))
                }
                onBlur={() => void saveFields()}
                placeholder={fieldExamples.extra_headers}
              />
            )}
          </Field>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
