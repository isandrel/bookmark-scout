import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, site } from "@bookmark-scout/config";

export const dynamic = "force-static";

/** Size of `public/icon.png`. */
const ICON_SIZE = "128x128";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: site.name,
        short_name: site.name,
        description: site.description,
        start_url: "/",
        display: "standalone",
        background_color: site.theme.light,
        theme_color: site.theme.accent,
        icons: [{ src: PUBLIC_PATHS.icon, sizes: ICON_SIZE, type: "image/png" }],
    };
}
