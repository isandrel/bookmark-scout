/// <reference types="bun" />
/**
 * One-time Cloudflare Pages setup for the website, run locally. Safe to re-run.
 *
 * 1. Creates the Pages project if it does not exist (needs Account > Cloudflare Pages: Edit).
 * 2. Attaches each domain in `[hosting] website_domains` to the project (same permission).
 * 3. Points each domain's DNS at `<project>.pages.dev` with a proxied CNAME, removing A and
 *    AAAA records for that name (needs Zone > DNS: Edit and Zone: Read).
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_PROJECT_NAME=… \
 *     bun scripts/setup-cloudflare.ts [--dry-run]
 *
 * Deploys themselves run in CI (`.github/workflows/deploy-website.yml`).
 */
import { WEBSITE_DOMAINS } from "@bookmark-scout/config";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_PROJECT_NAME: project } =
    process.env;
if (!token || !account || !project) {
    console.error("Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_PROJECT_NAME.");
    process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");

type ApiResult<T> = { success: boolean; result: T; errors: { code: number; message: string }[] };
type DnsRecord = { id: string; type: string; name: string; content: string; proxied: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return (await response.json()) as ApiResult<T>;
}

/** Runs a write unless --dry-run is set; exits with the permission hint on failure. */
async function write<T>(label: string, path: string, init: RequestInit, permission: string) {
    if (dryRun) {
        console.log(`  would ${label}`);
        return;
    }
    const result = await api<T>(path, init);
    if (!result.success) {
        console.error(`  failed to ${label}: ${JSON.stringify(result.errors)} (needs ${permission})`);
        process.exit(1);
    }
    console.log(`  ${label}`);
}

const pagesPermission = "Account > Cloudflare Pages: Edit";
const dnsPermission = "Zone > DNS: Edit and Zone > Zone: Read";
const projectPath = `/accounts/${account}/pages/projects/${project}`;

console.log(`Pages project ${project}`);
let info = await api<{ subdomain: string }>(projectPath);
if (!info.success) {
    await write(
        `create project ${project}`,
        `/accounts/${account}/pages/projects`,
        { method: "POST", body: JSON.stringify({ name: project, production_branch: "main" }) },
        pagesPermission,
    );
    info = await api<{ subdomain: string }>(projectPath);
}
const target = info.result?.subdomain ?? `${project}.pages.dev`;
console.log(`  serves at ${target}`);

console.log("Custom domains");
const domains = await api<{ name: string; status: string }[]>(`${projectPath}/domains`);
if (!domains.success && !dryRun) {
    console.error(`  cannot list domains: ${JSON.stringify(domains.errors)} (needs ${pagesPermission})`);
    process.exit(1);
}
const attached = new Map((domains.result ?? []).map((domain) => [domain.name, domain.status]));
for (const domain of WEBSITE_DOMAINS) {
    if (attached.has(domain)) {
        console.log(`  ${domain}: ${attached.get(domain)}`);
        continue;
    }
    await write(
        `attach ${domain}`,
        `${projectPath}/domains`,
        { method: "POST", body: JSON.stringify({ name: domain }) },
        pagesPermission,
    );
}

console.log("DNS");
for (const domain of WEBSITE_DOMAINS) {
    // The zone is the longest suffix of the domain that Cloudflare knows about.
    const labels = domain.split(".");
    let zoneId: string | undefined;
    for (let i = 0; i < labels.length - 1 && !zoneId; i++) {
        const zones = await api<{ id: string }[]>(`/zones?name=${labels.slice(i).join(".")}`);
        zoneId = zones.result?.[0]?.id;
    }
    if (!zoneId) {
        console.error(`  no Cloudflare zone for ${domain} (needs ${dnsPermission})`);
        process.exit(1);
    }

    const records = await api<DnsRecord[]>(`/zones/${zoneId}/dns_records?name=${domain}`);
    const existing = (records.result ?? []).filter((record) => ["A", "AAAA", "CNAME"].includes(record.type));
    const cname = existing.find((record) => record.type === "CNAME");
    if (cname?.content === target && cname.proxied && existing.length === 1) {
        console.log(`  ${domain}: CNAME ${target}`);
        continue;
    }
    for (const record of existing.filter((record) => record.type !== "CNAME")) {
        await write(
            `delete ${record.type} ${domain} -> ${record.content}`,
            `/zones/${zoneId}/dns_records/${record.id}`,
            { method: "DELETE" },
            dnsPermission,
        );
    }
    const body = JSON.stringify({ type: "CNAME", name: domain, content: target, proxied: true });
    await write(
        `point ${domain} at ${target}`,
        cname ? `/zones/${zoneId}/dns_records/${cname.id}` : `/zones/${zoneId}/dns_records`,
        { method: cname ? "PATCH" : "POST", body },
        dnsPermission,
    );
}
