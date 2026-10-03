/**
 * Pages and the background fetch the selected locale's messages; unit tests have no extension
 * files to fetch, so every locale is registered up front and `setLanguage` applies at once.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getLocaleMessagesPath, registerLocaleMessages, SUPPORTED_LOCALES } from '@/hooks/use-i18n';
import { appRoot } from '../../config-files';

for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(appRoot, 'public', getLocaleMessagesPath(locale));
  registerLocaleMessages(locale, JSON.parse(readFileSync(file, 'utf8')));
}
