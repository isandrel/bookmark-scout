/**
 * The address bar keyword of Address Bar Search (`config/ui/omnibox.toml`), which the manifest
 * build declares and Options names.
 */
import { z } from 'zod';

const omniboxConfig = readConfig(
  'ui/omnibox',
  z.strictObject({ keyword: z.string().regex(/^[a-z0-9]{1,16}$/) }),
);

export const ADDRESS_BAR_KEYWORD = omniboxConfig.keyword;
