// One-time setup for automated Chrome Web Store submission (the submit-chrome job in
// .github/workflows/release-extension.yml). Idempotent: running it again overwrites the same
// environment, variables, and secret. The Google Cloud side (project, API, service account, key)
// and adding the service account in the Developer Dashboard are manual; see
// store/checklists/chrome-web-store.md ("Automated submission").
//
// Usage:
//   bun scripts/setup-chrome-web-store-ci.ts --key <service-account.json> \
//     --publisher-id <id> --extension-id <id> [--publish-type STAGED_PUBLISH|DEFAULT_PUBLISH] \
//     [--enable] [--dry-run-submit] [--dry-run]
//
// --enable sets CWS_SUBMIT=true; without it the job stays off. --dry-run-submit makes the job
// run `wxt submit --dry-run` (checks authentication without uploading). --dry-run prints the gh
// commands instead of running them. The private key is passed to gh on stdin and never printed.
import { parseArgs } from "node:util";

const ENVIRONMENT = "chrome-web-store";
const PUBLISH_TYPES = ["STAGED_PUBLISH", "DEFAULT_PUBLISH"] as const;

const { values } = parseArgs({
  options: {
    key: { type: "string" },
    "publisher-id": { type: "string" },
    "extension-id": { type: "string" },
    "publish-type": { type: "string", default: "STAGED_PUBLISH" },
    enable: { type: "boolean", default: false },
    "dry-run-submit": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const keyPath = values.key ?? fail("--key <service-account.json> is required");
const publisherId = values["publisher-id"] ?? fail("--publisher-id is required");
const extensionId = values["extension-id"] ?? fail("--extension-id is required");
const publishType = values["publish-type"] as (typeof PUBLISH_TYPES)[number];
if (!PUBLISH_TYPES.includes(publishType))
  fail(`--publish-type must be one of ${PUBLISH_TYPES.join(", ")}`);
if (!/^[a-p]{32}$/.test(extensionId))
  fail("--extension-id must be the 32-letter Chrome extension ID");

type ServiceAccountKey = { type?: string; client_email?: string; private_key?: string };
const key = (await Bun.file(keyPath).json()) as ServiceAccountKey;
if (key.type !== "service_account" || !key.client_email || !key.private_key) {
  fail(`${keyPath} is not a Google service account JSON key`);
}

const repo = (await Bun.$`gh repo view --json nameWithOwner -q .nameWithOwner`.text()).trim();
const dryRun = values["dry-run"];

const run = async (args: string[], stdin?: string) => {
  const shown = `gh ${args.join(" ")}${stdin === undefined ? "" : " < (secret on stdin)"}`;
  if (dryRun) {
    console.log(`[dry run] ${shown}`);
    return;
  }
  const result = Bun.spawnSync(["gh", ...args], {
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
  });
  if (result.exitCode !== 0) fail(`${shown} failed:\n${result.stderr.toString()}`);
  console.log(`ok: ${shown}`);
};

// Environment that holds the secret; add a required reviewer in the repository settings so each
// submission waits for approval.
await run(["api", "--method", "PUT", `repos/${repo}/environments/${ENVIRONMENT}`, "--silent"]);
await run(
  ["secret", "set", "CHROME_SERVICE_ACCOUNT_PRIVATE_KEY", "--env", ENVIRONMENT, "--repo", repo],
  key.private_key,
);

const variables: Record<string, string> = {
  CHROME_PUBLISHER_ID: publisherId,
  CHROME_EXTENSION_ID: extensionId,
  CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL: key.client_email as string,
  CHROME_PUBLISH_TYPE: publishType,
  CWS_SUBMIT_DRY_RUN: String(values["dry-run-submit"]),
  CWS_SUBMIT: String(values.enable),
};
for (const [name, value] of Object.entries(variables)) {
  await run(["variable", "set", name, "--body", value, "--repo", repo]);
}

console.log(
  `\nDone for ${repo}. CWS_SUBMIT=${variables.CWS_SUBMIT}, publish type ${publishType}.` +
    `\nNext: add a required reviewer to the "${ENVIRONMENT}" environment in the repository settings,` +
    "\nthen delete the local key file or keep it only in a password manager.",
);
