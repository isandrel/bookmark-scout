import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { DOCS_URL } from '@bookmark-scout/config';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
    const pages = source.getPages();

    return pages.map((page) => ({
        url: `${DOCS_URL}${page.url}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: page.url === '/' ? 1.0 : 0.8,
    }));
}
