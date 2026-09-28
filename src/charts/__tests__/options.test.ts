import { describe, expect, it } from 'vitest'
import { SAMPLE_MONTE_CARLO_RESULT } from '../../test/fixtures'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { createSeededRng } from '../../domain/rng'
import { runSeason } from '../../domain/season'
import {
  buildBattleOption,
  buildCumulativeSpendOption,
  buildDailyBreakdownOption,
  buildScoreOption,
  buildSupplyEfficiencyOption,
} from '../options'

describe('chart option builders', () => {
  const identities = [
    ['A', '#57A8FF', '#2F7ED7', '#8CC8FF'],
    ['B', '#F3C665', '#C79425', '#F8D98F'],
    ['C', '#EF7AA8', '#CF4E82', '#F6A7C5'],
    ['D', '#7DD7C4', '#43AD98', '#A5E4D7'],
    ['联盟', '#F3C665', '#C79425', '#F8D98F'],
  ]
  const scenario = structuredClone(DEFAULT_SCENARIO)
  scenario.guilds.push({ ...structuredClone(scenario.guilds[0]), id: '联盟' })
  const season = runSeason(scenario, createSeededRng(1), 'deterministic')

  it('sets explicit deterministic line and legend colors by guild identity despite snapshot reordering', () => {
    for (const result of [season, { ...season, snapshots: season.snapshots.toReversed() }]) {
      const option = buildScoreOption(result)
      for (const [id, main] of identities) {
        const series = option.series.find((item) => item.name === id)
        expect(series?.lineStyle?.color).toBe(main)
        expect(series?.itemStyle?.color).toBe(main)
      }
    }
  })

  it('sets explicit MC median, interval, and legend colors independently of guild entry order', () => {
    const entries = identities.map(([id]) => [id, SAMPLE_MONTE_CARLO_RESULT.guilds.A] as const)
    for (const guilds of [Object.fromEntries(entries), Object.fromEntries(entries.toReversed())]) {
      const option = buildScoreOption({ ...SAMPLE_MONTE_CARLO_RESULT, guilds })
      for (const [id, main] of identities) {
        const median = option.series.find((item) => item.name === `${id} 中位数`)
        const interval = option.series.find((item) => item.name === `${id} P10–P90`)
        expect(median?.lineStyle?.color).toBe(main)
        expect(median?.itemStyle?.color).toBe(main)
        expect(interval?.lineStyle?.color).toBe(main)
        expect(interval?.itemStyle?.color).toBe(main)
        expect(interval?.areaStyle).toMatchObject({ color: main, opacity: 0.16 })
      }
    }
  })

  it('sets explicit daily battle and holding variants by guild identity after guild reordering', () => {
    for (const guilds of [season.guilds, Object.fromEntries(Object.entries(season.guilds).toReversed())]) {
      const option = buildDailyBreakdownOption({ ...season, guilds })
      for (const [id, , attack, holding] of identities) {
        expect(option.series.find((item) => item.name === `${id} 战斗`)?.itemStyle?.color).toBe(attack)
        expect(option.series.find((item) => item.name === `${id} 占领`)?.itemStyle?.color).toBe(holding)
      }
    }
  })

  it('builds a P10 to P90 band around the median', () => {
    const option = buildScoreOption(SAMPLE_MONTE_CARLO_RESULT)
    const names = option.series.map((series) => series.name)
    expect(names).toContain('A 中位数')
    expect(names).toContain('A P10–P90')
    expect(option.series.find((series) => series.name === 'A P10–P90')?.data)
      .toEqual([[0, 20]])
  })

  it('formats Monte Carlo tooltips as P10, median, and P90 bounds', () => {
    const option = buildScoreOption(SAMPLE_MONTE_CARLO_RESULT)
    const formatter = (option.tooltip as {
      formatter: (parameters: unknown) => string
    }).formatter
    const html = formatter([{
      seriesName: 'A 中位数',
      data: {
        value: [0, 20],
        meta: {
          guildId: 'A',
          quantiles: { minute: 0, p10: 10, median: 20, p90: 30, mean: 20 },
        },
      },
    }])

    expect(html).toContain('A')
    expect(html).toContain('P10：10')
    expect(html).toContain('中位数：20')
    expect(html).toContain('P90：30')
    expect(html).not.toContain('P10–P90：20')
  })

  it('uses domain-provided incremental score efficiency directly', () => {
    const option = buildSupplyEfficiencyOption(undefined, {
      request: {
        parameter: 'supply.versionUsdBudget',
        metric: 'firstPlaceProbability',
        min: 5,
        max: 5,
        step: 1,
        targetGuildId: 'A',
        targetTier: 'whale',
        runs: 1,
        seed: 1,
      },
      points: [{
        x: 5,
        metricValue: 0.5,
        incrementalScorePerUsd: 7.25,
        finalScore: 20,
        firstPlaceProbability: 0.5,
        nodeCounts: { normal: 1, core: 0, center: 0 },
        usd: 5,
        diamonds: 0,
        ads: 0,
        acceptedFans: 100,
        wastedFans: 0,
        actionCapacityBound: false,
      }],
      cancelled: false,
    })

    expect(option.series.find((series) => series.name === '每美元新增积分')?.data)
      .toEqual([[5, 7.25]])
  })

  it('formats cumulative tooltip currencies without floating point noise', () => {
    const option = buildCumulativeSpendOption({
      totals: [],
      byGroup: {
        A: [{ minute: 4560, cashUsd: 30.689999999999998, diamonds: 160, ads: 12 }],
      },
    })
    const formatter = (option.tooltip as {
      formatter: (parameters: unknown) => string
    }).formatter
    const html = formatter([
      { seriesName: 'A 现金', value: [4560, 30.689999999999998] },
      { seriesName: 'A 钻石', value: [4560, 160] },
      { seriesName: 'A 广告', value: [4560, 12] },
    ])

    expect(html).toContain('A 现金：$30.69')
    expect(html).toContain('A 钻石：160 钻')
    expect(html).toContain('A 广告：12 次')
    expect(html).not.toContain('30.689999999999998')
  })

  it('formats battle tooltip probabilities as percentages and fans as people', () => {
    const option = buildBattleOption([], [])
    const formatter = (option.tooltip as {
      formatter: (parameters: unknown) => string
    }).formatter
    const html = formatter([
      { seriesName: '1,000 显示倾向', value: [4, 0.585278604321229] },
      { seriesName: '1,000 真实胜率', value: [4, 1] },
      { seriesName: '1,000 守方粉丝', value: [4, 486] },
    ])

    expect(html).toContain('<strong>第 4 场</strong>')
    expect(html).toContain('1,000 显示倾向：58.5%')
    expect(html).toContain('1,000 真实胜率：100.0%')
    expect(html).toContain('1,000 守方粉丝：486')
    expect(html).not.toContain('0.585278604321229')
  })
})
