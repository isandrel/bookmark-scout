import { readOmniboxKeyword } from "@bookmark-scout/config";

/**
 * The Address Bar Search keyword from `apps/extension/config/ui/omnibox.toml`, as the key cap to
 * type (`<AddressBarKeyword />`), so the docs never type it by hand.
 */
export function AddressBarKeyword() {
  return <kbd className="bs-kbd">{readOmniboxKeyword()}</kbd>;
}
