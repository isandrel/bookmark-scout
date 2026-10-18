/**
 * "Check this computer" for Chrome's built-in AI (Options > AI): a compact checklist the extension
 * fills in itself (`builtin-ai-device.ts`): the model's state, the Chrome version, the operating
 * system, memory, and processor cores as measured, and free disk space and graphics memory as
 * requirements only, since no page can see them. Each row has a pass, fail, warning, or unknown
 * icon with a screen-reader label. While Chrome says the model cannot run here and no row rules
 * the computer out, it adds Chrome's switch that skips its hardware check and the page with the
 * model's state (each opens in a tab, with the address to copy), and **Check again**.
 */

import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';

const STATE_ICONS = {
  pass: { icon: CircleCheck, className: 'text-success', label: 'builtinAiCheck_statePass' },
  fail: { icon: CircleX, className: 'text-destructive-text', label: 'builtinAiCheck_stateFail' },
  warn: { icon: CircleAlert, className: 'text-warning', label: 'builtinAiCheck_stateWarn' },
  unknown: {
    icon: CircleHelp,
    className: 'text-muted-foreground',
    label: 'builtinAiCheck_stateUnknown',
  },
} as const satisfies Record<
  BuiltinAICheckState,
  { icon: typeof CircleCheck; className: string; label: MessageKey }
>;

const CHECK_LABELS: Record<BuiltinAICheckId | 'model', MessageKey> = {
  model: 'builtinAiCheck_model',
  browser: 'builtinAiCheck_browser',
  os: 'builtinAiCheck_os',
  memory: 'builtinAiCheck_memory',
  cores: 'builtinAiCheck_cores',
  disk: 'builtinAiCheck_disk',
  gpu: 'builtinAiCheck_gpu',
};

/** The model's row, in the same words as the state above the checklist. */
const MODEL_ROWS: Record<
  Exclude<BuiltinAIStatus, 'unsupported'>,
  { state: BuiltinAICheckState; text: MessageKey }
> = {
  available: { state: 'pass', text: 'builtinAi_statusReady' },
  downloadable: { state: 'pass', text: 'builtinAi_statusDownloadable' },
  downloading: { state: 'pass', text: 'builtinAi_statusDownloading' },
  unavailable: { state: 'fail', text: 'builtinAi_statusUnsupported' },
};

type Row = {
  id: BuiltinAICheckId | 'model';
  state: BuiltinAICheckState;
  value: string;
  note?: string;
};

/** A checked requirement in words: the measured value, and the requirement when it is not met. */
function describeCheck({ id, state, measured }: BuiltinAICheck): Row {
  const needs = builtinAIConfig.requirements;
  const notReported = t('builtinAiCheck_notVisible');
  switch (id) {
    case 'browser':
      return {
        id,
        state,
        value: measured ?? notReported,
        note: t('builtinAiCheck_browserNeed', String(needs.chrome_version)),
      };
    case 'os':
      return {
        id,
        state,
        value: measured ?? notReported,
        note: t('builtinAiCheck_osNeed', String(needs.macos_version)),
      };
    case 'memory': {
      const amount = measured === undefined ? undefined : formatGigabytes(Number(measured));
      const note = t('builtinAiCheck_memoryNeed', formatGigabytes(needs.ram_gb));
      if (amount === undefined) return { id, state, value: notReported, note };
      // Unknown with a value: Chrome reported its cap, so the real amount may be more.
      const value = t(
        state === 'unknown' ? 'builtinAiCheck_memoryAtLeast' : 'builtinAiCheck_memoryAbout',
        amount,
      );
      return { id, state, value, note };
    }
    case 'cores':
      return {
        id,
        state,
        value: measured ?? notReported,
        note: t('builtinAiCheck_coresNeed', String(needs.cpu_cores)),
      };
    case 'disk':
      return {
        id,
        state,
        value: t('builtinAiCheck_notVisible'),
        note: t('builtinAiCheck_diskNeed', formatGigabytes(needs.free_disk_gb)),
      };
    case 'gpu':
      return {
        id,
        state,
        value: t('builtinAiCheck_notVisible'),
        note: t('builtinAiCheck_gpuNeed', formatGigabytes(needs.gpu_vram_gb)),
      };
  }
}

function CheckRow({ row }: { row: Row }) {
  const { icon: Icon, className, label } = STATE_ICONS[row.state];
  return (
    <li
      data-check={row.id}
      data-state={row.state}
      className="flex items-start gap-2 px-3 py-1.5 text-sm"
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${className}`} />
      <span className="sr-only">{t(label)}: </span>
      <span className="flex min-w-0 flex-1 flex-col gap-x-3 sm:flex-row">
        <span className="shrink-0 text-muted-foreground sm:w-36">{t(CHECK_LABELS[row.id])}</span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span data-slot="check-value">{row.value}</span>
          {row.state !== 'pass' && row.note && (
            <span data-slot="check-note" className="block text-xs text-muted-foreground">
              {row.note}
            </span>
          )}
        </span>
      </span>
    </li>
  );
}

/** One of Chrome's own pages: open it in a tab, or copy its address when Chrome refuses. */
function BrowserPageLink({
  url,
  label,
  note,
}: {
  url: string;
  label: MessageKey;
  /** What to expect on the page, under the button. */
  note?: string;
}) {
  const [message, setMessage] = useState<string>();
  const open = () => {
    setMessage(undefined);
    openBuiltinAIBrowserPage(url).catch(() => setMessage(t('builtinAiCheck_openFailed')));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(t('bookmarks_detailsCopied'));
    } catch {
      setMessage(t('bookmarks_detailsCopyFailed'));
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={open}>
          <ExternalLink aria-hidden="true" className="size-3.5" />
          {t(label)}
        </Button>
        {/* The address and its Copy button wrap together. */}
        <span className="inline-flex min-w-0 items-center gap-1">
          <code className="min-w-0 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {url}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label={t('builtinAiCheck_copyAddress', url)}
            title={t('builtinAiCheck_copyAddress', url)}
            onClick={() => void copy()}
          >
            <Copy aria-hidden="true" className="size-3.5" />
          </Button>
        </span>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
        {message}
      </p>
    </div>
  );
}

export function BuiltinAIDeviceCheck({
  status,
  defaultOpen = false,
}: {
  /** The model's state; the check is not shown without the API or where a policy turned it off. */
  status: Exclude<BuiltinAIStatus, 'unsupported'>;
  defaultOpen?: boolean;
}) {
  const { device, reread } = useBuiltinAIDevice();
  const [checking, setChecking] = useState(false);
  const [stillUnavailable, setStillUnavailable] = useState(false);
  const checks = device ? checkBuiltinAIDevice(device) : undefined;
  const model = MODEL_ROWS[status];
  const rows: Row[] = [
    { id: 'model', state: model.state, value: t(model.text) },
    ...(checks ?? []).map(describeCheck),
  ];
  const { check } = builtinAIConfig;

  const checkAgain = async () => {
    setChecking(true);
    setStillUnavailable(false);
    try {
      const [next] = await Promise.all([getBuiltinAIStatus({ refresh: true }), reread()]);
      setStillUnavailable(next === 'unavailable');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Collapsible defaultOpen={defaultOpen} data-testid="builtin-ai-check">
      <CollapsibleTrigger className="group/check inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform group-data-[panel-open]/check:rotate-90"
        />
        {t('builtinAiCheck_title')}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        <ul
          aria-label={t('builtinAiCheck_title')}
          aria-busy={checks === undefined}
          className="divide-y rounded-md border"
        >
          {rows.map((row) => (
            <CheckRow key={row.id} row={row} />
          ))}
        </ul>
        {status === 'unavailable' && (
          <div className="space-y-2 text-sm" data-testid="builtin-ai-check-guidance">
            {checks && !builtinAICheckFails(checks) && (
              <>
                <p>{t('builtinAiCheck_unavailableHint')}</p>
                <p>{t('builtinAiCheck_flagStep', check.flag_choice)}</p>
                <BrowserPageLink url={check.flag_url} label="builtinAiCheck_openFlags" />
                <BrowserPageLink
                  url={check.internals_url}
                  label="builtinAiCheck_openInternals"
                  note={t('builtinAiCheck_internalsNote')}
                />
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={checking}
                onClick={() => void checkAgain()}
              >
                {checking ? (
                  <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                )}
                {t('builtinAiCheck_checkAgain')}
              </Button>
              <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
                {stillUnavailable ? t('builtinAiCheck_stillUnavailable') : ''}
              </p>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
