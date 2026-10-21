/**
 * The built-in model's state in its service editor (Options > AI): ready, not on this computer yet
 * (with **Download the model**, its size, and what Chrome needs), downloading (with progress, or
 * a bar without a value for a download this page did not start), not supported on this computer,
 * turned off by the organization, or missing from this browser (and that it needs a newer Chrome
 * when that is why). Under it, in Chrome, "Check this computer" (`BuiltinAIDeviceCheck`), open
 * while Chrome says the model cannot run here and folded otherwise. Below that, what the service does
 * and does not do (and which service does the rest), which languages it reads best (or that it does
 * not read the extension's language), and that nothing leaves the computer. The download starts
 * only from the button's click (`downloadBuiltinAIModel`).
 */

import { CircleAlert, CircleCheck, Download, Info, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { AI_FEATURES } from '@/lib/config/ai-provider-schema';

const STATUS_TONES = {
  success: 'border-success/30 bg-success-wash text-success',
  warning: 'border-warning/30 bg-warning-wash text-warning',
  info: 'border-border bg-muted text-foreground',
} as const;

type StatusTone = keyof typeof STATUS_TONES;

/** Each AI feature's name, for the list of what the built-in model leaves to other services. */
const AI_FEATURE_NAMES: Record<AIFeature, MessageKey> = {
  folderRecommendation: 'ai_folderRecommendation',
  quickSave: 'builtinAi_featureQuickSave',
  askAI: 'askAI_title',
  autoTagging: 'tools_autoTagging',
  summarizer: 'tools_summarizer',
  reorganization: 'tools_aiReorganize',
};

/** The features the built-in model does not serve (its provider file's `features`). */
const otherFeatures = BUILTIN_AI_PROVIDER
  ? AI_FEATURES.filter((feature) => !providerSupportsFeature(BUILTIN_AI_PROVIDER, feature)).map(
      (feature) => AI_FEATURE_NAMES[feature],
    )
  : [];

/** Names languages (`ja`) in the extension's language ("Japanese"), or by code without `Intl`. */
function languageNamer(): (code: string) => string {
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(getFormattingLocale(), { type: 'language' });
  } catch {
    names = undefined;
  }
  return (code) => names?.of(code) ?? code;
}

/** The languages the model reads best, named in the extension's language. */
function modelLanguageList(): string {
  return formatList(builtinAIConfig.model_languages.map(languageNamer()));
}

/**
 * When the extension's own language is not one the model reads (`model_languages`), a note that
 * pages in it may get word-match suggestions; undefined for a language it reads.
 */
export function builtinAILanguageNote(): string | undefined {
  const language = getResolvedLanguage().split('_')[0] ?? '';
  if (builtinAIReadsLanguage(language)) return undefined;
  return t('qaOptions_builtinLanguageNote', [modelLanguageList(), languageNamer()(language)]);
}

function requirementsText(): string {
  const needs = builtinAIConfig.requirements;
  return t('builtinAi_requirements', [
    formatGigabytes(needs.free_disk_gb),
    formatGigabytes(needs.gpu_vram_gb),
    formatGigabytes(needs.ram_gb),
    String(needs.cpu_cores),
  ]);
}

function downloadSizeText(): string {
  const needs = builtinAIConfig.requirements;
  return t('builtinAi_downloadSize', [
    formatGigabytes(needs.download_gb_gpu),
    formatGigabytes(needs.download_gb_cpu),
  ]);
}

function StatusBox({
  tone,
  title,
  children,
}: {
  tone: StatusTone;
  title: string;
  children?: React.ReactNode;
}) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'warning' ? CircleAlert : Info;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${STATUS_TONES[tone]}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
        <p className="font-medium">{title}</p>
        {children && <div className="space-y-2 text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}

export function BuiltinAIModelStatus() {
  const status = useBuiltinAIStatus(true, { poll: true });
  const { state } = useAIServices();
  // The features it leaves out go to another enabled service, when there is one.
  const hasOtherService = state.services.some(
    (service) => service.enabled && !isBuiltinProvider(service.provider),
  );
  const languageNote = builtinAILanguageNote();
  // Progress of a download this page started, from 0 to 1.
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reason = useBuiltinAIUnavailableReason(status);

  const download = () => {
    setError(null);
    setProgress(0);
    // First in the click handler: Chrome starts a download only right after a click.
    downloadBuiltinAIModel(setProgress)
      .catch((cause: unknown) => setError(getErrorMessage(cause)))
      .finally(() => setProgress(null));
  };

  const downloading = progress !== null || status === 'downloading';
  const canCheck = canCheckBuiltinAIDevice();
  // Without the API, the Chrome version may be why: read it only then.
  const { device } = useBuiltinAIDevice(canCheck && status === 'unsupported');
  const outdatedChrome = device && builtinAIOutdatedChrome(device);
  // The checklist, wherever the API exists and no policy turned the model off.
  const checkStatus = (() => {
    if (!canCheck || status === undefined || status === 'unsupported') return undefined;
    if (status === 'unavailable') return reason === 'device' ? status : undefined;
    return downloading ? 'downloading' : status;
  })();

  const body = (() => {
    if (status === undefined) return null;
    if (status === 'available') {
      return <StatusBox tone="success" title={t('builtinAi_statusReady')} />;
    }
    if (status === 'unsupported') {
      return (
        <StatusBox tone="warning" title={t('builtinAi_statusNoApi')}>
          {outdatedChrome && (
            <p data-testid="builtin-ai-outdated">
              {t('builtinAiCheck_browserNeed', String(builtinAIConfig.requirements.chrome_version))}
            </p>
          )}
        </StatusBox>
      );
    }
    if (status === 'unavailable') {
      return reason === 'policy' ? (
        <StatusBox tone="warning" title={t('builtinAi_statusPolicy')} />
      ) : (
        <StatusBox tone="warning" title={t('builtinAi_statusUnsupported')}>
          {/* Where the checklist shows, it states each requirement beside what was measured. */}
          {!canCheck && <p>{requirementsText()}</p>}
        </StatusBox>
      );
    }
    if (downloading) {
      // Progress is known only for a download this page started; one started elsewhere (another
      // tab, an earlier visit, or Chrome itself) shows a bar without a value until it finishes.
      return (
        <StatusBox tone="info" title={t('builtinAi_statusDownloading')}>
          {progress === null ? (
            <>
              <div
                role="progressbar"
                aria-label={t('builtinAi_statusDownloading')}
                data-testid="builtin-ai-progress"
                className="h-1.5 w-full overflow-hidden rounded-full bg-background"
              >
                <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
              </div>
              <p>{t('qaOptions_builtinDownloadBackground')}</p>
            </>
          ) : (
            <>
              <div
                role="progressbar"
                aria-label={t('builtinAi_statusDownloading')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * PERCENT)}
                data-testid="builtin-ai-progress"
                className="h-1.5 w-full overflow-hidden rounded-full bg-background"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress * PERCENT}%` }}
                />
              </div>
              <p className="font-mono text-xs tabular-nums">{formatPercent(progress)}</p>
            </>
          )}
          <p>{t('builtinAi_downloadKeepOpen')}</p>
        </StatusBox>
      );
    }
    return (
      <StatusBox tone="info" title={t('builtinAi_statusDownloadable')}>
        <p>{downloadSizeText()}</p>
        <p>{requirementsText()}</p>
        <Button type="button" onClick={download}>
          <Download className="h-4 w-4" />
          {t('builtinAi_download')}
        </Button>
      </StatusBox>
    );
  })();

  return (
    <div className="space-y-3" data-testid="builtin-ai-status" data-status={status ?? 'loading'}>
      <div role="status" aria-live="polite">
        {status === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t('builtinAi_statusChecking')}
          </p>
        ) : (
          body
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t('builtinAi_downloadFailed', error)}
        </p>
      )}
      {checkStatus && (
        <BuiltinAIDeviceCheck status={checkStatus} defaultOpen={checkStatus === 'unavailable'} />
      )}
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {otherFeatures.length > 0 && (
          <li data-testid="builtin-ai-scope">
            {t(
              hasOtherService ? 'qaOptions_builtinScopeOther' : 'builtinAi_scope',
              formatList(otherFeatures.map((key) => t(key))),
            )}
          </li>
        )}
        <li data-testid="builtin-ai-languages">
          {languageNote ?? t('builtinAi_languages', modelLanguageList())}
        </li>
        <li>{t('builtinAi_privacy')}</li>
      </ul>
    </div>
  );
}
