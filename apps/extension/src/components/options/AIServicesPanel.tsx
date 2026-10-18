/**
 * The list of saved AI services in Options: add one from any provider preset or a hand-written
 * endpoint, edit it in place, test it, set the default, duplicate, or delete it.
 */

import { ChevronDown, Copy, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

type ProviderOption = SearchableSelectOption;

const PROVIDER_GROUP_LABELS: Record<AIProviderGroup, MessageKey> = {
  featured: 'settings_aiProviderGroupFeatured',
  local: 'settings_aiProviderGroupLocal',
  custom: 'settings_aiProviderGroupCustom',
  catalog: 'settings_aiProviderGroupCatalog',
};

/**
 * Every provider as a picker option, grouped like the provider catalog. The built-in model is
 * listed (first) only where this computer can run it, and a provider that allows one service
 * only while it has none.
 */
function providerOptions(offerBuiltin: boolean, services: readonly AIService[]): ProviderOption[] {
  const added = new Set(services.map((service) => service.provider));
  return getAvailableProviders()
    .filter((provider) => offerBuiltin || !isBuiltinProvider(provider.id))
    .filter((provider) => !(isSingleServiceProvider(provider.id) && added.has(provider.id)))
    .map((provider) => ({
      value: provider.id,
      label: getLocalizedProviderName(provider.id),
      group: t(PROVIDER_GROUP_LABELS[getProviderGroup(provider.id)]),
      iconUrl: getProviderLogoUrl(provider.id),
      icon: <ProviderIcon provider={provider.id} className="size-4" />,
    }));
}

function ServiceLogo({ provider }: { provider: AIProvider }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
    >
      <ProviderIcon provider={provider} className="size-4" />
    </span>
  );
}

function AddServiceDialog({
  open,
  services,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  services: readonly AIService[];
  onOpenChange: (open: boolean) => void;
  onAdded: (service: AIService) => void;
}) {
  const [provider, setProvider] = useState<string>(DEFAULT_SERVICE_PROVIDER);
  const [name, setName] = useState('');
  const options = providerOptions(canOfferBuiltinAI(useBuiltinAIStatus(open)), services);
  const catalogGroup = t(PROVIDER_GROUP_LABELS.catalog);

  const add = async () => {
    const service = await addAIService(provider, name);
    // The next add starts from the default: the provider just added may no longer be listed.
    setProvider(DEFAULT_SERVICE_PROVIDER);
    setName('');
    onOpenChange(false);
    onAdded(service);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('options_aiServiceAddTitle')}</DialogTitle>
          <DialogDescription>{t('options_aiServicesDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label id="ai-service-add-provider" className="text-sm font-medium">
              {t('options_aiServiceProvider')}
            </Label>
            {/* Well-known providers first; the long catalog shows once the user searches. */}
            <SearchableSelect
              aria-labelledby="ai-service-add-provider"
              value={provider}
              options={options}
              onValueChange={setProvider}
              searchPlaceholder={t('select_searchPlaceholder')}
              emptyText={t('select_noMatches')}
              searchOnlyGroups={[catalogGroup]}
              searchOnlyHint={tPlural(
                'aiOnboard_moreProvidersHint',
                options.filter((option) => option.group === catalogGroup).length,
              )}
            />
          </div>
          <Field id="ai-service-add-name" label={t('options_aiServiceName')}>
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={getLocalizedProviderName(provider)}
                autoComplete="off"
              />
            )}
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('action_cancel')}
          </Button>
          <Button onClick={() => void add()}>{t('options_aiServiceAdd')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AIServicesPanel({
  showAdvanced = false,
  searchMatches = [],
}: {
  showAdvanced?: boolean;
  /** In a settings search, the panel fields it matched. */
  searchMatches?: readonly AIServicesSearchField[];
}) {
  const { state, isLoading } = useAIServices();
  // Services a restored backup could not fully set up: their API key or headers are missing.
  const { value: credentials } = useStoredValue(aiProviderConfigValue);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AIService | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Set when a delete is confirmed: the service whose row takes focus, or null for none left.
  const focusAfterDeleteRef = useRef<string | null | undefined>(undefined);

  // The default service's editor starts open, so a single setup reads like before.
  const openId = expandedId ?? state.defaultServiceId ?? null;
  // A search that matched editor fields (API Key, Model) while no hosted service's editor is open
  // shows where they are instead of a count with nothing under it.
  const openService = state.services.find((service) => service.id === openId);
  const hiddenMatches =
    openService && !isBuiltinProvider(openService.provider)
      ? []
      : searchMatches.filter((field) => field.editor);

  /** After a delete, the menu that opened the dialog is gone; focus the next row instead. */
  const focusAfterDialog = () => {
    const id = focusAfterDeleteRef.current;
    focusAfterDeleteRef.current = undefined;
    if (id === undefined) return true;
    const row = id
      ? listRef.current?.querySelector<HTMLElement>(
          `[data-service-id="${CSS.escape(id)}"] [aria-controls]`,
        )
      : null;
    return row ?? addButtonRef.current ?? true;
  };

  return (
    <OptionsPanel
      id="ai-services"
      actionsLayout="wrap"
      data-testid="ai-services"
      title={t('options_aiServices')}
      description={t('options_aiServicesDescription')}
      actions={
        <Button ref={addButtonRef} variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          {t('options_aiServiceAdd')}
        </Button>
      }
    >
      {!isLoading && state.services.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('options_aiServiceEmpty')}
        </p>
      )}
      {!isLoading && hiddenMatches.length > 0 && (
        <p data-testid="ai-services-search-hint" className="text-sm text-muted-foreground">
          {t(
            'qaOptions_searchInService',
            formatList(hiddenMatches.flatMap((field) => field.text.slice(0, 1))),
          )}
        </p>
      )}

      <ul
        ref={listRef}
        className={cn(
          'divide-y overflow-hidden rounded-md border',
          state.services.length === 0 && 'hidden',
        )}
      >
        {state.services.map((service) => {
          const isDefault = service.id === state.defaultServiceId;
          const isOpen = service.id === openId;
          const editorId = `ai-service-${service.id}-panel`;
          return (
            <li key={service.id} data-testid="ai-service" data-service-id={service.id}>
              <div className="flex items-center gap-3 px-3 py-2">
                <ServiceLogo provider={service.provider} />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isOpen}
                  aria-controls={editorId}
                  aria-label={t('options_aiServiceEdit', service.name)}
                  onClick={() => setExpandedId(isOpen ? '' : service.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{service.name}</span>
                      {isDefault && (
                        <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                          {t('options_aiServiceDefault')}
                        </span>
                      )}
                      {Boolean(credentials[service.id]?.pendingSecrets?.length) && (
                        <span
                          data-testid="ai-service-needs-setup"
                          className="shrink-0 rounded-sm border border-warning/40 bg-warning-wash px-1.5 py-0.5 text-xs font-medium text-warning"
                        >
                          {t('options_aiServiceNeedsSetup')}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {getLocalizedProviderName(service.provider)}
                      {service.model
                        ? ` ${t('format_separator')} ${getModelDisplayName(service.provider, service.model)}`
                        : ''}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
                <Switch
                  checked={service.enabled}
                  onCheckedChange={(enabled) => void updateAIService(service.id, { enabled })}
                  aria-label={t('options_aiServiceEnabled', service.name)}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('options_aiServiceActions', service.name)}
                      />
                    }
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={isDefault}
                      onClick={() => void setDefaultAIService(service.id)}
                    >
                      <Star className="h-4 w-4" />
                      {t('options_aiServiceSetDefault')}
                    </DropdownMenuItem>
                    {!isSingleServiceProvider(service.provider) && (
                      <DropdownMenuItem
                        onClick={() =>
                          void duplicateAIService(service.id).then((copy) => {
                            if (copy) setExpandedId(copy.id);
                          })
                        }
                      >
                        <Copy className="h-4 w-4" />
                        {t('options_aiServiceDuplicate')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive-text"
                      onClick={() => setDeleting(service)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('action_delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {isOpen && (
                <div id={editorId} className="border-t bg-background/40 px-4 py-4">
                  {isBuiltinProvider(service.provider) ? (
                    <BuiltinAIServiceEditor service={service} />
                  ) : (
                    <AIServiceEditor service={service} showAdvanced={showAdvanced} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AddServiceDialog
        open={adding}
        services={state.services}
        onOpenChange={setAdding}
        onAdded={(s) => setExpandedId(s.id)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('options_aiServiceDeleteTitle', deleting?.name ?? '')}
        description={t('options_aiServiceDeleteDescription')}
        confirmLabel={t('action_delete')}
        finalFocus={focusAfterDialog}
        onConfirm={() => {
          if (!deleting) return;
          const index = state.services.findIndex((service) => service.id === deleting.id);
          const neighbor = state.services[index + 1] ?? state.services[index - 1];
          focusAfterDeleteRef.current = neighbor?.id ?? null;
          void deleteAIService(deleting.id);
        }}
      />
    </OptionsPanel>
  );
}
