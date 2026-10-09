import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUBLIC_PATHS, site } from "@bookmark-scout/config";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getPageImage, source } from "@/lib/source";

export const revalidate = false;

/** Dark brand tokens from app/global.css (paper from config); the card is always on the navy paper. */
const OG_COLORS = {
  paper: site.theme.dark,
  ink: "#e8eff6",
  inkSoft: "#9fb2c6",
  line: "#23394f",
  teal: "#3cc4c9",
  ribbon: "linear-gradient(160deg, #2bb3b1 0%, #4f6ce0 48%, #8a3fd1 100%)",
} as const;

const OG_SIZE = { width: 1200, height: 630 } as const;

async function loadIcon(): Promise<string> {
  const icon = await readFile(join(process.cwd(), "public", PUBLIC_PATHS.icon));
  return `data:image/png;base64,${icon.toString("base64")}`;
}

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  const icon = await loadIcon();
  const title = page.slugs.length === 0 ? site.docs.name : page.data.title;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        backgroundColor: OG_COLORS.paper,
        color: OG_COLORS.ink,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 96,
          width: 72,
          height: 132,
          backgroundImage: OG_COLORS.ribbon,
          clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img elements. */}
        <img src={icon} width={64} height={64} alt="" />
        <span
          style={{ fontSize: 36, fontWeight: 700, color: OG_COLORS.inkSoft }}
        >
          {site.docs.name}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          maxWidth: 960,
        }}
      >
        {title}
      </div>
      {page.data.description ? (
        <div
          style={{
            display: "flex",
            marginTop: 24,
            paddingTop: 24,
            borderTop: `4px solid ${OG_COLORS.teal}`,
            fontSize: 34,
            lineHeight: 1.35,
            color: OG_COLORS.inkSoft,
            maxWidth: 980,
          }}
        >
          {page.data.description}
        </div>
      ) : null}
    </div>,
    OG_SIZE,
  );
}

export function generateStaticParams() {
  // One card per page, in English; translated pages use their English page's card (DESIGN.md).
  return source.getPages(DEFAULT_LOCALE).map((page) => ({
    slug: getPageImage(page).segments,
  }));
}
