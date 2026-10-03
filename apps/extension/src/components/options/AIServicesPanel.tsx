/**
 * The list of saved AI services in Options: add one from any provider preset or a hand-written
 * endpoint, edit it in place, test it, set the default, duplicate, or delete it.
 */

import { ChevronDown, Copy, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

type ProviderOption = SearchableSelectOption;

/** Every provider as a picker option, grouped like the provider catalog. */
function providerOptions(): ProviderOption[] {
  const groupLabels: Record<AIProviderGroup, MessageKey> = {
    featured: 'settings_aiProviderGroupFeatured',
    local: 'settings_aiProviderGroupLocal',
    custom: 'settings_aiProviderGroupCustom',
    catalog: 'settings_aiProviderGroupCatalog',
  };
  return getAvailableProviders().map((provider) => ({
    value: provider.id,
    label: getLocalizedProviderName(provider.id),
    group: t(groupLabels[getProviderGroup(provider.id)]),
    iconUrl: getProviderLogoUrl(provider.id),
  }));
}

function ServiceLogo({ provider }: { provider: AIProvider }) {
  const url = getProviderLogoUrl(provider);
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
    >
      {url ? (
        <MaskIcon url={url} className="size-4" />
      ) : (
        <span className="text-xs font-semibold uppercase">{provider.slice(0, 2)}</span>
      )}
    </span>
  );
}

function AddServiceDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (service: AIService) => void;
}) {
  const [provider, setProvider] = useState<string>(defaultSettings.aiProvider);
  const [name, setName] = useState('');
  const options = providerOptions();

  const add = async () => {
    const service = await addAIService(provider, name);
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
            <SearchableSelect
              aria-labelledby="ai-service-add-provider"
              value={provider}
              options={options}
              onValueChange={setProvider}
              searchPlaceholder={t('select_searchPlaceholder')}
              emptyText={t('select_noMatches')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-service-add-name" className="text-sm font-medium">
              {t('options_aiServiceName')}
            </Label>
            <Input
              id="ai-service-add-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={getLocalizedProviderName(provider)}
              autoComplete="off"
            />
          </div>
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

function DeleteServiceDialog({
  service,
  onClose,
}: {
  service: AIService | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={service !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('options_aiServiceDeleteTitle', service?.name ?? '')}</DialogTitle>
          <DialogDescription>{t('options_aiServiceDeleteDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('action_cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (service) void deleteAIService(service.id);
              onClose();
            }}
          >
            {t('action_delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AIServicesPanel({ showAdvanced = false }: { showAdvanced?: boolean }) {
  const { state, isLoading } = useAIServices();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AIService | null>(null);

  // The default service's editor starts open, so a single setup reads like before.
  const openId = expandedId ?? state.defaultServiceId ?? null;

  return (
    <section
      aria-labelledby="ai-services-heading"
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="ai-services"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="ai-services-heading" className="text-base font-medium">
            {t('options_aiServices')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('options_aiServicesDescription')}</p>
        </div>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          {t('options_aiServiceAdd')}
        </Button>
      </div>

      {!isLoading && state.services.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('options_aiServiceEmpty')}
        </p>
      )}

      <ul className="divide-y overflow-hidden rounded-md border">
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
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {getLocalizedProviderName(service.provider)}
                      {service.model ? ` ${t('format_separator')} ${service.model}` : ''}
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
                  <AIServiceEditor service={service} showAdvanced={showAdvanced} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AddServiceDialog open={adding} onOpenChange={setAdding} onAdded={(s) => setExpandedId(s.id)} />
      <DeleteServiceDialog service={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}
