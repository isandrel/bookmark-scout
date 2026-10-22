/**
 * The sites a tool run requests, chosen before it starts (Index Page Text): each site the run
 * would download from with its bookmark count, checked or not as `config/ui/site-choice.toml`
 * says, with Select all and Select none, a filter once the list is long, and Show more past a
 * page. Only the chosen sites are asked for website access and requested; the run lists
 * bookmarks on the others as not chosen.
 */
import { useId, useMemo, useState } from 'react';
import { z } from 'zod';

const siteChoiceConfig = readConfig(
  'ui/site-choice',
  z.strictObject({
    checked_by_default: z.boolean(),
    filter_above: z.number().int().nonnegative(),
    page_size: z.number().int().positive(),
  }),
);

export type SiteChoiceDialogProps = {
  open: boolean;
  /** The sites to choose from, most bookmarks first (`countUrlSites`). */
  sites: readonly SiteCount[];
  /** Runs with the chosen sites, in the listed order. */
  onConfirm: (sites: string[]) => void;
  onCancel: () => void;
};

export function SiteChoiceDialog({ open, sites, onConfirm, onCancel }: SiteChoiceDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="site-choice">
        {/* Mounted on each open, so every choice starts from the default. */}
        <SiteChoiceForm sites={sites} onConfirm={onConfirm} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}

function SiteChoiceForm({ sites, onConfirm, onCancel }: Omit<SiteChoiceDialogProps, 'open'>) {
  const listId = useId();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(siteChoiceConfig.checked_by_default ? sites.map(({ site }) => site) : []),
  );
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(siteChoiceConfig.page_size);
  const query = filter.trim().toLowerCase();
  const matching = useMemo(
    () => (query ? sites.filter(({ site }) => site.includes(query)) : sites),
    [sites, query],
  );
  const listed = matching.slice(0, shown);
  const chosenSites = sites.flatMap(({ site }) => (chosen.has(site) ? [site] : []));

  // Select all and Select none act on the sites the filter shows.
  const setMany = (names: readonly string[], on: boolean) =>
    setChosen((previous) => {
      const next = new Set(previous);
      for (const name of names) {
        if (on) next.add(name);
        else next.delete(name);
      }
      return next;
    });
  const matchingNames = matching.map(({ site }) => site);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('tools_siteChoiceTitle')}</DialogTitle>
        <DialogDescription>{t('tools_siteChoiceDesc')}</DialogDescription>
      </DialogHeader>
      {sites.length > siteChoiceConfig.filter_above ? (
        <Input
          type="search"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setShown(siteChoiceConfig.page_size);
          }}
          placeholder={t('tools_siteChoiceFilter')}
          aria-label={t('tools_siteChoiceFilter')}
          aria-controls={listId}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMany(matchingNames, true)}>
          {t('table_selectAll')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMany(matchingNames, false)}>
          {t('tools_siteChoiceSelectNone')}
        </Button>
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {tPlural('tools_siteChoiceChosen', sites.length, [String(chosenSites.length)])}
        </p>
      </div>
      <div className="max-h-[45vh] min-w-0 overflow-y-auto rounded-md border">
        {listed.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{t('tools_siteChoiceNoMatch')}</p>
        ) : (
          <ul id={listId} className="divide-y">
            {listed.map(({ site, count }) => {
              const controlId = `${listId}-${site}`;
              return (
                <li key={site}>
                  <label
                    htmlFor={controlId}
                    data-testid="site-choice-row"
                    className="flex min-h-9 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      id={controlId}
                      checked={chosen.has(site)}
                      onCheckedChange={(next) => setMany([site], next === true)}
                    />
                    <span className="min-w-0 flex-1 truncate" title={site}>
                      {site}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {tPlural('tools_siteIconsBookmarkCount', count)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {matching.length > listed.length ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShown((count) => count + siteChoiceConfig.page_size)}
            >
              {t(
                'tools_siteChoiceShowMore',
                String(Math.min(siteChoiceConfig.page_size, matching.length - listed.length)),
              )}
            </Button>
          </div>
        ) : null}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t('action_cancel')}
        </Button>
        <Button disabled={chosenSites.length === 0} onClick={() => onConfirm(chosenSites)}>
          {tPlural('tools_siteChoiceStart', chosenSites.length)}
        </Button>
      </DialogFooter>
    </>
  );
}
