/**
 * A provider's icon: its one-color logo where the provider file or catalog has one, otherwise a
 * generic icon for its kind (a program on this computer, a custom endpoint, Chrome's built-in
 * model), or the first letter of its name, so every provider in a list has an icon.
 */

import type { LucideIcon } from 'lucide-react';
import { Laptop, Plug, Server } from 'lucide-react';

const GROUP_ICONS: Partial<Record<AIProviderGroup, LucideIcon>> = {
  local: Server,
  custom: Plug,
};

export function ProviderIcon({ provider, className }: { provider: AIProvider; className: string }) {
  const url = getProviderLogoUrl(provider);
  if (url) return <MaskIcon url={url} className={className} />;
  const Icon = isBuiltinProvider(provider) ? Laptop : GROUP_ICONS[getProviderGroup(provider)];
  if (Icon) return <Icon aria-hidden="true" className={className} />;
  return (
    <span aria-hidden="true" className="text-[0.625rem] font-semibold uppercase leading-none">
      {getLocalizedProviderName(provider).slice(0, 1)}
    </span>
  );
}
