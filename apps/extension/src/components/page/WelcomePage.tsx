/**
 * The welcome page (`welcome.html`), opened once after install (`services/welcome-page.ts`):
 * three short steps for a first-time user. Pinning shows only while the button is not on the
 * toolbar (or where the browser does not say), the shortcut step names the keys quick save
 * really has, and the Bookmarks page note shows only where the manager replaces the browser's.
 */

import { BookOpen, BookMarked, Settings } from 'lucide-react';

type WelcomeStep = { id: string; title: string; body: React.ReactNode };

/** Whether this build replaces the browser's Bookmarks page (Chrome and Edge, not Firefox). */
function replacesBookmarksPage(): boolean {
  const manifest = browser.runtime.getManifest() as {
    chrome_url_overrides?: { bookmarks?: string };
  };
  return Boolean(manifest.chrome_url_overrides?.bookmarks);
}

function QuickSaveKeys() {
  const { shortcuts } = useCommandShortcuts();
  const keys = shortcuts?.['quick-save'];
  if (keys === undefined) return null;
  if (keys === '') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span>{t('welcome_shortcutNotSet')}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void openCommandShortcutSetup()}
        >
          {t('popup_shortcutSetUp')}
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{t('welcome_shortcutBody')}</span>
      <span data-testid="welcome-shortcut" className="flex items-center gap-1">
        {commandShortcutKeyCaps(keys, { apple: isApplePlatform() }).map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
    </span>
  );
}

export function WelcomePage() {
  const pinned = useToolbarPinned();
  const steps: WelcomeStep[] = [
    ...(pinned === true
      ? []
      : [{ id: 'pin', title: t('welcome_pinTitle'), body: t('welcome_pinBody') }]),
    { id: 'save', title: t('welcome_saveTitle'), body: t('welcome_saveBody') },
    { id: 'shortcut', title: t('welcome_shortcutTitle'), body: <QuickSaveKeys /> },
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex items-center gap-4">
          <img src="/icon-96.png" alt="" width={48} height={48} className="size-12" />
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('welcome_heading')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('welcome_intro')}</p>
          </div>
        </header>

        <ol className="divide-y overflow-hidden rounded-lg border bg-card">
          {steps.map((step, index) => (
            <li key={step.id} data-welcome-step={step.id} className="flex gap-4 p-4">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-medium text-accent-foreground"
              >
                {index + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="text-base font-semibold">{step.title}</h2>
                <div className="text-sm text-muted-foreground">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>

        {replacesBookmarksPage() && (
          <p
            data-testid="welcome-manager-note"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <BookMarked aria-hidden="true" className="size-4 shrink-0" />
            {t('welcome_managerNote')}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            <Settings aria-hidden="true" className="size-4" />
            {t('welcome_openSettings')}
          </Button>
          <a
            href={WELCOME_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'ghost' })}
          >
            <BookOpen aria-hidden="true" className="size-4" />
            {t('welcome_readGuide')}
          </a>
        </div>
      </div>
    </main>
  );
}
