import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

const docsOptions = {
  tree: source.pageTree,
  nav: {
    title: '🔖 Bookmark Scout',
  },
  links: [
    {
      text: 'Website',
      url: 'https://bookmark-scout.com',
    },
    {
      text: 'GitHub',
      url: 'https://github.com/isandrel/bookmark-scout',
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
