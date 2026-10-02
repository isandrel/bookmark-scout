/// <reference types="bun" />
/**
 * Attaches the configured custom domains (`[hosting] website_domains`) to the
 * website's Cloudflare Pages project. Safe to re-run: existing domains are kept.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_PROJECT_NAME=… bun scripts/attach-domains.ts
 */
import { WEBSITE_DOMAINS } from "@bookmark-scout/config";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_PROJECT_NAME: project } =
    process.env;
if (!token || !account || !project) {
    console.error("Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_PROJECT_NAME.");
    process.exit(1);
}

type ApiResult<T> = { success: boolean; result: T; errors: { code: number; message: string }[] };
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`;

async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return (await response.json()) as ApiResult<T>;
}

const existing = await api<{ name: string }[]>("/domains");
if (!existing.success) {
    console.error(`Cannot list domains: ${JSON.stringify(existing.errors)}`);
    process.exit(1);
}
const attached = new Set(existing.result.map((domain) => domain.name));

let failed = false;
for (const domain of WEBSITE_DOMAINS) {
    if (attached.has(domain)) continue;
    const added = await api("/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
    if (!added.success) {
        failed = true;
        console.error(`Could not attach ${domain}: ${JSON.stringify(added.errors)}`);
    }
}

const projectInfo = await api<{ subdomain: string }>("");
const domains = await api<{ name: string; status: string }[]>("/domains");
console.log(`Pages project ${project} serves at ${projectInfo.result?.subdomain}`);
for (const domain of domains.result ?? []) console.log(`  ${domain.name}: ${domain.status}`);
process.exit(failed ? 1 : 0);
