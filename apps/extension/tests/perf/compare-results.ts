/**
 * Judges a head build against a base build measured on the same machine, scenario by scenario
 * (`compare.ts` runs them; `[compare]` in `perf.toml` sets the thresholds). Shared runners
 * differ in speed by more than most regressions, so on CI a metric fails only when head is slower
 * than base by a ratio, an absolute margin, and, with enough samples, a one-sided rank-sum test.
 */
import { z } from 'zod';
import type { CompareSettings } from './perf-config';

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** One metric of a scenario report, as `PerfReport.write` saves it. */
const metricReportSchema = z.object({
  metric: z.string().min(1),
  unit: z.string().min(1),
  timedOut: z.number().int().nonnegative(),
  samples: z.array(z.number()),
  budget: z.number().positive().optional(),
});

/** A `<scenario>.json` report; fields this module does not read are allowed and ignored. */
export const scenarioReportSchema = z.object({ metrics: z.array(metricReportSchema) });

export type MetricReport = z.infer<typeof metricReportSchema>;
export type ScenarioReport = z.infer<typeof scenarioReportSchema>;

/** Every metric of one side, with the samples and timeouts of all its rounds put together. */
export function poolReports(reports: ScenarioReport[]): Map<string, MetricReport> {
  const pooled = new Map<string, MetricReport>();
  for (const { metrics } of reports) {
    for (const row of metrics) {
      const seen = pooled.get(row.metric);
      pooled.set(
        row.metric,
        seen
          ? {
              ...seen,
              samples: [...seen.samples, ...row.samples],
              timedOut: seen.timedOut + row.timedOut,
            }
          : { ...row, samples: [...row.samples] },
      );
    }
  }
  return pooled;
}

/**
 * The probability that `first`'s rank sum in the pooled samples is at least what it is, if
 * every split of the pooled values into groups of these sizes were equally likely: the exact
 * one-sided Wilcoxon rank-sum (Mann-Whitney U) test that `first` tends to be larger. Ties get
 * their mean rank and the distribution is enumerated with them, so it stays exact.
 */
export function rankSumPValue(first: number[], second: number[]): number {
  if (first.length === 0 || second.length === 0) return 1;
  const pooled = [
    ...first.map((value) => ({ value, first: true })),
    ...second.map((value) => ({ value, first: false })),
  ].sort((a, b) => a.value - b.value);
  // Twice the mean rank of each tie group, so every rank is an integer.
  const doubledRanks: number[] = [];
  for (let start = 0; start < pooled.length; ) {
    let end = start;
    while (end + 1 < pooled.length && pooled[end + 1].value === pooled[start].value) end += 1;
    for (let index = start; index <= end; index++) doubledRanks.push(start + end + 2);
    start = end + 1;
  }
  const observed = doubledRanks.reduce(
    (sum, rank, index) => (pooled[index].first ? sum + rank : sum),
    0,
  );
  const picks = first.length;
  const maxSum = doubledRanks.reduce((sum, rank) => sum + rank, 0);
  // ways[k][s]: subsets of the ranks seen so far with k members summing to s.
  const ways = Array.from({ length: picks + 1 }, () => new Float64Array(maxSum + 1));
  ways[0][0] = 1;
  for (const rank of doubledRanks) {
    for (let k = picks; k >= 1; k--) {
      for (let sum = maxSum; sum >= rank; sum--) ways[k][sum] += ways[k - 1][sum - rank];
    }
  }
  let atLeast = 0;
  let total = 0;
  for (let sum = 0; sum <= maxSum; sum++) {
    total += ways[picks][sum];
    if (sum >= observed) atLeast += ways[picks][sum];
  }
  return atLeast / total;
}

/**
 * - `slower`: head is slower than base beyond every threshold (fails the comparison).
 * - `timed out`: head timed out where base did not (fails the comparison).
 * - `faster`: head is faster than base beyond every threshold.
 * - `same`: within the thresholds.
 * - `incomparable`: one side has no samples (a new scenario, a base run that failed, or both
 *   timed out); its absolute numbers are still shown.
 * - `reported`: the metric has no budget, so it is shown but not judged.
 */
export type Verdict = 'slower' | 'timed out' | 'faster' | 'same' | 'incomparable' | 'reported';

export type SideSummary = { median: number | null; samples: number[]; timedOut: number };

export type Comparison = {
  metric: string;
  unit: string;
  budget: number | undefined;
  base: SideSummary | null;
  head: SideSummary | null;
  /** Head median over base median; null when either is missing. */
  ratio: number | null;
  /** Head median minus base median; null when either is missing. */
  delta: number | null;
  /** The rank-sum test's p-value in the direction of the change; null with too few samples. */
  pValue: number | null;
  verdict: Verdict;
};

const summarize = (report: MetricReport | undefined): SideSummary | null =>
  report
    ? {
        median: report.samples.length ? median(report.samples) : null,
        samples: report.samples,
        timedOut: report.timedOut,
      }
    : null;

/** Compares one metric; `base` or `head` is undefined when that side never reported it. */
export function compareMetric(
  metric: string,
  base: MetricReport | undefined,
  head: MetricReport | undefined,
  settings: CompareSettings,
): Comparison {
  const unit = head?.unit ?? base?.unit ?? 'ms';
  const budget = head?.budget ?? base?.budget;
  const baseSide = summarize(base);
  const headSide = summarize(head);
  const result: Comparison = {
    metric,
    unit,
    budget,
    base: baseSide,
    head: headSide,
    ratio: null,
    delta: null,
    pValue: null,
    verdict: budget === undefined ? 'reported' : 'incomparable',
  };
  if (budget !== undefined && headSide && baseSide && headSide.timedOut > 0) {
    if (baseSide.timedOut === 0) return { ...result, verdict: 'timed out' };
  }
  if (headSide?.median == null || baseSide?.median == null) return result;

  const ratio =
    baseSide.median === 0
      ? headSide.median === 0
        ? 1
        : Number.POSITIVE_INFINITY
      : headSide.median / baseSide.median;
  const delta = headSide.median - baseSide.median;
  const tested =
    headSide.samples.length >= settings.min_samples &&
    baseSide.samples.length >= settings.min_samples;
  const pValue = tested
    ? delta >= 0
      ? rankSumPValue(headSide.samples, baseSide.samples)
      : rankSumPValue(baseSide.samples, headSide.samples)
    : null;
  const compared = { ...result, ratio, delta, pValue };
  if (budget === undefined) return compared;

  const margin = settings.min_delta[unit];
  if (margin === undefined) {
    throw new Error(`[compare] min_delta in perf.toml has no margin for "${unit}" (${metric})`);
  }
  const significant = pValue === null || pValue <= settings.max_p_value;
  if (ratio > settings.max_ratio && delta > margin && significant) {
    return { ...compared, verdict: 'slower' };
  }
  if (ratio < 1 / settings.max_ratio && -delta > margin && significant) {
    return { ...compared, verdict: 'faster' };
  }
  return { ...compared, verdict: 'same' };
}

/** Compares every metric either side reported, in head's order, then those only base reported. */
export function compareResults(
  base: Map<string, MetricReport>,
  head: Map<string, MetricReport>,
  settings: CompareSettings,
): Comparison[] {
  const metrics = [...head.keys(), ...[...base.keys()].filter((metric) => !head.has(metric))];
  return metrics.map((metric) =>
    compareMetric(metric, base.get(metric), head.get(metric), settings),
  );
}

/** Verdicts that fail the comparison. */
export const isRegression = ({ verdict }: Comparison) =>
  verdict === 'slower' || verdict === 'timed out';

const formatSide = (side: SideSummary | null, unit: string) => {
  if (!side) return '-';
  const value = side.median === null ? '-' : `${side.median} ${unit}`;
  const timeouts = side.timedOut ? `, ${side.timedOut} timed out` : '';
  return `${value} (n=${side.samples.length}${timeouts})`;
};

const formatChange = ({ ratio, delta, unit }: Comparison) => {
  if (ratio === null || delta === null) return '-';
  const percent = Number.isFinite(ratio)
    ? `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`
    : 'from 0';
  return `${percent} (${delta >= 0 ? '+' : ''}${delta} ${unit})`;
};

const formatBudget = ({ budget, head }: Comparison) => {
  if (budget === undefined) return '-';
  return head?.median != null && head.median > budget ? `${budget} (over)` : String(budget);
};

const HEADER = ['Metric', 'Base', 'Head', 'Change', 'p', 'Budget', 'Result'];

/** The rows as table cells, in `HEADER` order. */
function cells(rows: Comparison[]): string[][] {
  return rows.map((row) => [
    row.metric,
    formatSide(row.base, row.unit),
    formatSide(row.head, row.unit),
    formatChange(row),
    row.pValue === null ? '-' : row.pValue < 0.001 ? '<0.001' : row.pValue.toFixed(3),
    formatBudget(row),
    row.verdict,
  ]);
}

/** A Markdown table, for the job summary. */
export function comparisonMarkdown(rows: Comparison[]): string {
  const line = (values: string[]) => `| ${values.join(' | ')} |`;
  return [line(HEADER), line(HEADER.map(() => '---')), ...cells(rows).map(line)].join('\n');
}

/** A padded plain-text table, for the log. */
export function comparisonText(rows: Comparison[]): string {
  const table = [HEADER, ...cells(rows)];
  const widths = HEADER.map((_, column) => Math.max(...table.map((row) => row[column].length)));
  return table
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}
