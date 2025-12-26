import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { SITE_NAME, SITE_URL, GITHUB_URL, DOCS_NAME } from '@bookmark-scout/config';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

const docsOptions = {
  tree: source.pageTree,
  nav: {
    title: `🔖 ${DOCS_NAME}`,
  },
  links: [
    {
      text: 'Website',
      url: SITE_URL,
    },
    {
      text: 'GitHub',
      url: GITHUB_URL,
    },
  ],
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>
          <DocsLayout {...docsOptions}>{children}</DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
