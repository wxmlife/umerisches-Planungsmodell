import { describe, expect, it } from 'vitest'
import { SAMPLE_MONTE_CARLO_RESULT } from '../../test/fixtures'
import {
  buildBattleOption,
  buildCumulativeSpendOption,
  buildScoreOption,
  buildSupplyEfficiencyOption,
} from '../options'

describe('chart option builders', () => {
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
        parameter: 'supply.dailyUsdBudget',
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
