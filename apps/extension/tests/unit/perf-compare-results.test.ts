import { describe, expect, it } from 'vitest';
import {
  compareMetric,
  compareResults,
  comparisonMarkdown,
  comparisonText,
  isRegression,
  type MetricReport,
  poolReports,
  rankSumPValue,
} from '../perf/compare-results';
import { type CompareSettings, perfConfig } from '../perf/perf-config';

const settings: CompareSettings = {
  default_base: 'origin/main',
  rounds: 1,
  max_ratio: 1.25,
  min_delta: { ms: 50, frames: 10 },
  max_p_value: 0.05,
  min_samples: 4,
  base_checkout_dir: 'bookmark-scout-perf-base',
};

const report = (samples: number[], extra: Partial<MetricReport> = {}): MetricReport => ({
  metric: 'manager.open',
  unit: 'ms',
  timedOut: 0,
  samples,
  budget: 2000,
  ...extra,
});

describe('rankSumPValue', () => {
  it('gives the exact one-sided p-value when every first sample is larger', () => {
    // One split in C(10, 5) = 252 puts all five largest values in the first group.
    expect(rankSumPValue([6, 7, 8, 9, 10], [1, 2, 3, 4, 5])).toBeCloseTo(1 / 252, 10);
    expect(rankSumPValue([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])).toBe(1);
  });

  it('matches the textbook tail for small groups', () => {
    // n = m = 3: U = 8 of 9 has 2 of 20 splits at or above it.
    expect(rankSumPValue([3, 5, 6], [1, 2, 4])).toBeCloseTo(2 / 20, 10);
  });

  it('stays exact with ties', () => {
    // Identical samples: every split has the same rank sum.
    expect(rankSumPValue([5, 5, 5], [5, 5, 5])).toBe(1);
    // Mean ranks [1, 2.5, 2.5, 4]: first is {2.5, 4}, and two of the six splits reach its 6.5.
    expect(rankSumPValue([2, 3], [1, 2])).toBeCloseTo(2 / 6, 10);
  });

  it('is 1 with an empty side', () => {
    expect(rankSumPValue([], [1])).toBe(1);
  });
});

describe('poolReports', () => {
  it('puts samples and timeouts of every round together', () => {
    const pooled = poolReports([
      {
        metrics: [
          report([100, 110]),
          report([5], { metric: 'popup.scroll.longFrames', unit: 'frames' }),
        ],
      },
      { metrics: [report([120], { timedOut: 1 })] },
    ]);
    expect(pooled.get('manager.open')).toMatchObject({ samples: [100, 110, 120], timedOut: 1 });
    expect(pooled.get('popup.scroll.longFrames')?.samples).toEqual([5]);
  });
});

describe('compareMetric', () => {
  it('passes a slow runner: both sides over the budget by the same factor', () => {
    const base = report([2010, 2040, 2034, 2100, 1990]);
    const head = report([2050, 2020, 2060, 2080, 2001]);
    expect(compareMetric('manager.open', base, head, settings).verdict).toBe('same');
  });

  it('fails a real regression beyond the ratio, margin, and test', () => {
    const result = compareMetric(
      'manager.open',
      report([900, 950, 1000, 920, 980]),
      report([1300, 1350, 1400, 1320, 1380]),
      settings,
    );
    expect(result).toMatchObject({ verdict: 'slower', delta: 400 });
    expect(result.ratio).toBeCloseTo(1350 / 950);
    expect(result.pValue).toBeCloseTo(1 / 252, 10);
    expect(isRegression(result)).toBe(true);
  });

  it('needs the absolute margin as well as the ratio', () => {
    // 20 to 40 ms doubles but stays within 50 ms.
    const result = compareMetric(
      'manager.openFolder',
      report([20, 21, 19, 20, 22]),
      report([40, 41, 39, 40, 42]),
      settings,
    );
    expect(result.verdict).toBe('same');
  });

  it('needs the rank-sum test when both sides have enough samples', () => {
    // The medians differ by 1.6x, but the samples overlap: one noisy side, not a shift.
    const result = compareMetric(
      'manager.open',
      report([500, 520, 900, 1000, 510]),
      report([520, 530, 830, 1100, 1050]),
      settings,
    );
    expect(result.ratio).toBeGreaterThan(settings.max_ratio);
    expect(result.pValue).toBeGreaterThan(settings.max_p_value);
    expect(result.verdict).toBe('same');
  });

  it('judges single samples by the ratio and margin alone', () => {
    const result = compareMetric(
      'jobs.reviewOpen',
      report([340], { budget: 400 }),
      report([544], { budget: 400 }),
      settings,
    );
    expect(result).toMatchObject({ verdict: 'slower', pValue: null });
  });

  it('reports a faster head', () => {
    const result = compareMetric(
      'manager.open',
      report([1300, 1350, 1400, 1320, 1380]),
      report([900, 950, 1000, 920, 980]),
      settings,
    );
    expect(result.verdict).toBe('faster');
    expect(result.pValue).toBeCloseTo(1 / 252, 10);
  });

  it('uses the margin of the metric unit', () => {
    const frames = { metric: 'popup.scroll.longFrames', unit: 'frames', budget: 25 };
    expect(
      compareMetric(
        'popup.scroll.longFrames',
        report([4, 5, 4, 6, 5], frames),
        report([11, 9, 12, 10, 11], frames),
        settings,
      ).verdict,
    ).toBe('same');
    expect(
      compareMetric(
        'popup.scroll.longFrames',
        report([4, 5, 4, 6, 5], frames),
        report([40, 38, 41, 36, 44], frames),
        settings,
      ).verdict,
    ).toBe('slower');
  });

  it('treats any rise from zero as past the ratio', () => {
    const frames = { unit: 'frames', budget: 10 };
    const result = compareMetric(
      'manager.cards.scroll.longFrames',
      report([0, 0, 0, 0, 0], frames),
      report([20, 22, 19, 21, 20], frames),
      settings,
    );
    expect(result).toMatchObject({ verdict: 'slower', ratio: Number.POSITIVE_INFINITY });
  });

  it('fails a head that timed out where base did not', () => {
    const result = compareMetric(
      'popup.expandAll',
      report([10, 11]),
      report([12], { timedOut: 1 }),
      settings,
    );
    expect(result.verdict).toBe('timed out');
    expect(isRegression(result)).toBe(true);
  });

  it('compares what is left when both sides timed out', () => {
    expect(
      compareMetric(
        'popup.expandAll',
        report([10], { timedOut: 1 }),
        report([11], { timedOut: 1 }),
        settings,
      ).verdict,
    ).toBe('same');
    expect(
      compareMetric(
        'popup.expandAll',
        report([], { timedOut: 5 }),
        report([], { timedOut: 5 }),
        settings,
      ).verdict,
    ).toBe('incomparable');
  });

  it('cannot judge a metric base never reported', () => {
    const result = compareMetric(
      'manager.list.covers.scroll.longFrames',
      undefined,
      report([30]),
      settings,
    );
    expect(result).toMatchObject({ verdict: 'incomparable', ratio: null });
    expect(isRegression(result)).toBe(false);
  });

  it('only reports a metric without a budget', () => {
    const result = compareMetric(
      'jobs.linksPerSecond',
      report([400], { budget: undefined, unit: 'links/s' }),
      report([100], { budget: undefined, unit: 'links/s' }),
      settings,
    );
    expect(result).toMatchObject({ verdict: 'reported', delta: -300 });
  });

  it('refuses a budgeted unit without a margin', () => {
    expect(() =>
      compareMetric(
        'search.heapKiB',
        report([1, 2], { unit: 'KiB' }),
        report([1, 2], { unit: 'KiB' }),
        settings,
      ),
    ).toThrow(/min_delta.*KiB/);
  });
});

describe('compareResults', () => {
  it('lists head metrics in order, then those only base reported', () => {
    const base = poolReports([
      { metrics: [report([1000]), report([5], { metric: 'old.metric' })] },
    ]);
    const head = poolReports([
      { metrics: [report([5], { metric: 'new.metric' }), report([1010])] },
    ]);
    expect(compareResults(base, head, settings).map(({ metric }) => metric)).toEqual([
      'new.metric',
      'manager.open',
      'old.metric',
    ]);
  });

  it('prints absolute numbers, the change, and the budget', () => {
    const rows = compareResults(
      poolReports([{ metrics: [report([2000, 2010, 1990, 2020, 2005])] }]),
      poolReports([{ metrics: [report([2100, 2080, 2120, 2090, 2110])] }]),
      settings,
    );
    expect(comparisonMarkdown(rows)).toContain(
      '| manager.open | 2005 ms (n=5) | 2100 ms (n=5) | +5% (+95 ms) | 0.004 | 2000 (over) | same |',
    );
    expect(comparisonText(rows).split('\n')[0]).toMatch(
      /^Metric\s+Base\s+Head\s+Change\s+p\s+Budget\s+Result$/,
    );
  });
});

describe('perf.toml [compare]', () => {
  it('has a margin for the unit of every budgeted metric the scenarios report', () => {
    // Budgets are in ms unless the metric counts frames or KiB of heap (perf.toml, [budgets_ms]).
    const unitOf = (metric: string) =>
      metric.endsWith('longFrames') ? 'frames' : metric.endsWith('KiB') ? 'KiB' : 'ms';
    for (const metric of Object.keys(perfConfig.budgets_ms)) {
      expect(perfConfig.compare.min_delta[unitOf(metric)], metric).toBeTypeOf('number');
    }
  });
});
