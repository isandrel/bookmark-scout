/**
 * Whether this extension page is open in a private (incognito) window. Mozilla's add-on policies
 * forbid storing data from private browsing, and users expect the same everywhere, so what a page
 * would otherwise keep from its own use (chats, recent searches) is not kept there.
 */
export function inPrivateWindow(): boolean {
  return browser.extension?.inIncognitoContext === true;
}
