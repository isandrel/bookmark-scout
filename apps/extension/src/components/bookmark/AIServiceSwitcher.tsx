import { ChevronDown } from 'lucide-react';

/**
 * Picks the default AI service from the popup, next to the AI button. Shown only when more than
 * one service is enabled, so a single setup keeps a plain button.
 */
export function AIServiceSwitcher() {
  const { state } = useAIServices();
  const enabled = state.services.filter((service) => service.enabled);
  if (enabled.length < 2) return null;
  const current = enabled.find((service) => service.id === state.defaultServiceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="-ml-1 shrink-0"
            aria-label={t('popup_aiServiceSwitch', current?.name ?? '')}
            title={t('popup_aiServiceSwitch', current?.name ?? '')}
            data-testid="ai-service-switcher"
          />
        }
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-64">
        <DropdownMenuRadioGroup
          value={state.defaultServiceId ?? ''}
          onValueChange={(id) => void setDefaultAIService(String(id))}
        >
          {enabled.map((service) => (
            <DropdownMenuRadioItem key={service.id} value={service.id} closeOnClick>
              <span className="min-w-0">
                <span className="block truncate">{service.name}</span>
                {service.model && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {service.model}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
