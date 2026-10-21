/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The docs site from config/web.toml, without a trailing slash (`build/site-defines.ts`). */
  readonly BOOKMARK_SCOUT_DOCS_URL: string;
  /** `[browsers] supported` from config/project.toml as a JSON array (`build/site-defines.ts`). */
  readonly BOOKMARK_SCOUT_BROWSERS: string;
}
