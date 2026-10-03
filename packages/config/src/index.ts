/**
 * @bookmark-scout/config
 *
 * The workspace config (`config/project.toml` and `config/web.toml`), validated once and
 * exposed as a site model. Server and build code only: it reads files with `node:fs`, so
 * client components receive values as props.
 *
 * @example
 * import { site } from "@bookmark-scout/config";
 * site.url.page("ja", "/privacy"); // https://bookmark-scout.com/ja/privacy/
 * site.repo.file("SECURITY.md");   // https://github.com/<owner>/<repo>/blob/main/SECURITY.md
 */
import { createSite } from "./site";
import { readWorkspaceConfig } from "./workspace";

export { ConfigError } from "./schema";
export {
	SCREENSHOT_SIZE,
	SCREENSHOTS,
	type ScreenshotName,
	type ScreenshotPair,
	SOCIAL_SCREENSHOT,
} from "./screenshots";
export {
	type ContactRole,
	createSite,
	joinUrl,
	PUBLIC_PATHS,
	type Site,
	type StoreListing,
	TITLE_SEPARATOR,
	titleTemplate,
	withSiteName,
} from "./site";
export {
	CONFIG_DIR,
	CONFIG_FILES,
	findConfigDir,
	type ProjectConfig,
	parseProjectConfig,
	parseWebConfig,
	readWorkspaceConfig,
	type WebConfig,
	type WorkspaceConfig,
} from "./workspace";

/** Every site value and URL builder, from the validated workspace config files. */
const workspace = readWorkspaceConfig();
export const site = createSite(workspace.project, workspace.web);
