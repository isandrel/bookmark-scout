import {
  type ProviderAddressPart,
  readProviderAddress,
} from "@bookmark-scout/config";

/**
 * An AI provider's default address from its file in
 * `apps/extension/config/ai/providers/` (`<ProviderAddress id="ollama" />`), as code, so the docs
 * never type an address by hand. `part="host"` shows only the host and port (`localhost:11434`).
 */
export function ProviderAddress({
  id,
  part = "url",
}: {
  id: string;
  part?: ProviderAddressPart;
}) {
  return <code>{readProviderAddress(id, part)}</code>;
}
