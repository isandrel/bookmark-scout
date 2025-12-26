import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

const baseUrl = 'https://docs.bookmark-scout.com';

export default function sitemap(): MetadataRoute.Sitemap {
    const pages = source.getPages();

    return pages.map((page) => ({
        url: `${baseUrl}${page.url}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: page.url === '/' ? 1.0 : 0.8,
    }));
}
