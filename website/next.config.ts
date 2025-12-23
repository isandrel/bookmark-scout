import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/bookmark-scout",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
