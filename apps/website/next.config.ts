import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  output: "export" as const,
  // Set NEXT_PUBLIC_BASE_PATH only when serving under a sub-path; empty on Cloudflare Pages
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default withNextIntl(nextConfig);
