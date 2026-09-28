import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import {
  deriveNodeTargetThreshold,
  deriveSpendThresholds,
  runSensitivity,
  type SensitivityPoint,
} from '../sensitivity'

describe('sensitivity analysis', () => {
  it('sweeps a whitelisted parameter without mutating the scenario', async () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.season.nodeCounts = { normal: 4, core: 1, center: 0 }
    const original = structuredClone(scenario)
    const result = await runSensitivity(scenario, {
      parameter: 'battle.beta',
      metric: 'battleThreeWinProbability',
      min: 1.8,
      max: 2.2,
      step: 0.2,
      targetGuildId: 'A',
      runs: 2,
      seed: 17,
    })
    expect(result.points.map((point) => point.x)).toEqual([1.8, 2, 2.2])
    expect(scenario).toEqual(original)
  })

  it('derives spend and node thresholds only from observed grid points', () => {
    const points: SensitivityPoint[] = [
      { x: 0, metricValue: 0.42, finalScore: 10, firstPlaceProbability: 0.42, nodeCounts: { normal: 18, core: 2, center: 1 }, usd: 0, diamonds: 0, ads: 0, acceptedFans: 0, wastedFans: 0 },
      { x: 5, metricValue: 0.51, finalScore: 20, firstPlaceProbability: 0.51, nodeCounts: { normal: 19, core: 3, center: 1 }, usd: 5, diamonds: 0, ads: 0, acceptedFans: 1000, wastedFans: 0 },
      { x: 10, metricValue: 0.83, finalScore: 30, firstPlaceProbability: 0.83, nodeCounts: { normal: 20, core: 3, center: 1 }, usd: 10, diamonds: 0, ads: 0, acceptedFans: 2000, wastedFans: 0 },
    ]
    expect(deriveSpendThresholds(points)).toEqual({ dailyBudget50: 5, dailyBudget80: 10 })
    expect(deriveSpendThresholds(points.slice(0, 2)).dailyBudget80).toBeNull()
    expect(deriveNodeTargetThreshold(points, { normal: 20, core: 2, center: 1 })).toBe(10)
    expect(deriveNodeTargetThreshold(points, { normal: 21, core: 2, center: 1 })).toBeNull()
  })
})
