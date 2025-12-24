import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/bookmark-scout",
  images: { unoptimized: true },
  trailingSlash: true,
  turbopack: {
    root: ".",
  },
};

export default withNextIntl(nextConfig);
