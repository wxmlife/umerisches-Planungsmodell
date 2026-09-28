import { describe, expect, it, vi } from 'vitest'
import * as runner from '../../worker/runner'
import { createPurchaseScenario } from '../../test/fixtures'
import { DEFAULT_SCENARIO } from '../defaults'
import {
  deriveNodeTargetThreshold,
  deriveSpendThresholds,
  runSensitivity,
  type SensitivityPoint,
} from '../sensitivity'

describe('sensitivity analysis', () => {
  it('localizes every scan and hidden zero control to the target guild and tier', async () => {
    const scenario = createPurchaseScenario()
    scenario.supply.offers.push(...structuredClone(DEFAULT_SCENARIO.supply.offers))
    scenario.guilds[0].roster = { normal: 0, small: 0, whale: 1 }
    scenario.guilds.push({ ...structuredClone(scenario.guilds[0]), id: 'B', name: 'B' })
    const original = structuredClone(scenario)
    const trials = vi.spyOn(runner, 'runTrials')
    try {
      const result = await runSensitivity(scenario, {
        parameter: 'supply.versionUsdBudget', metric: 'incrementalScorePerUsd',
        min: 3, max: 6, step: 3, targetGuildId: 'B', targetTier: 'whale', runs: 1, seed: 1,
      })
      expect(result.points.map((point) => point.x)).toEqual([3, 6])
      expect(trials.mock.calls).toHaveLength(3)
      for (const [index, [request]] of trials.mock.calls.entries()) {
        const expected = structuredClone(original)
        expected.guilds[1].purchasePolicies.whale.versionUsdBudget = [0, 3, 6][index]
        expect(request.scenario).toEqual(expected)
      }
      expect(result.points[0].usd).toBeLessThanOrEqual(3)
      expect(result.points[1].usd).toBeLessThanOrEqual(6)
      expect(scenario).toEqual(original)
    } finally {
      trials.mockRestore()
    }
  })
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
      { x: 0, metricValue: 0.42, incrementalScorePerUsd: 0, finalScore: 10, firstPlaceProbability: 0.42, nodeCounts: { normal: 18, core: 2, center: 1 }, usd: 0, diamonds: 0, ads: 0, acceptedFans: 0, wastedFans: 0, actionCapacityBound: false },
      { x: 5, metricValue: 0.51, incrementalScorePerUsd: 2, finalScore: 20, firstPlaceProbability: 0.51, nodeCounts: { normal: 19, core: 3, center: 1 }, usd: 5, diamonds: 0, ads: 0, acceptedFans: 1000, wastedFans: 0, actionCapacityBound: false },
      { x: 10, metricValue: 0.83, incrementalScorePerUsd: 2, finalScore: 30, firstPlaceProbability: 0.83, nodeCounts: { normal: 20, core: 3, center: 1 }, usd: 10, diamonds: 0, ads: 0, acceptedFans: 2000, wastedFans: 0, actionCapacityBound: false },
    ]
    expect(deriveSpendThresholds(points)).toEqual({ versionBudget50: 5, versionBudget80: 10 })
    expect(deriveSpendThresholds(points.slice(0, 2)).versionBudget80).toBeNull()
    expect(deriveNodeTargetThreshold(points, { normal: 20, core: 2, center: 1 })).toBe(10)
    expect(deriveNodeTargetThreshold(points, { normal: 21, core: 2, center: 1 })).toBeNull()
  })

  it('reports incremental score per USD against the zero-budget point', async () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.season.days = 1
    scenario.season.centerUnlockDay = 1
    scenario.season.nodeCounts = { normal: 4, core: 1, center: 0 }
    const result = await runSensitivity(scenario, {
      parameter: 'supply.versionUsdBudget',
      metric: 'incrementalScorePerUsd',
      min: 0,
      max: 5,
      step: 5,
      targetGuildId: 'A',
      targetTier: 'whale',
      runs: 2,
      seed: 23,
    })
    const [baseline, paid] = result.points

    expect(baseline.metricValue).toBe(0)
    expect(paid.usd).toBeGreaterThan(0)
    expect(paid.metricValue).toBeCloseTo(
      (paid.finalScore - baseline.finalScore) / paid.usd,
      10,
    )
  })

  it('uses a hidden zero-budget control when the visible scan starts above zero', async () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.season.days = 1
    scenario.season.centerUnlockDay = 1
    scenario.season.nodeCounts = { normal: 4, core: 1, center: 0 }
    const request = {
      parameter: 'supply.versionUsdBudget' as const,
      metric: 'incrementalScorePerUsd' as const,
      min: 5,
      max: 5,
      step: 1,
      targetGuildId: 'A',
      targetTier: 'whale' as const,
      runs: 2,
      seed: 31,
    }
    const paid = await runSensitivity(scenario, request)
    const free = await runSensitivity(scenario, { ...request, min: 0, max: 0 })
    const paidPoint = paid.points[0]
    const freePoint = free.points[0]

    expect(paidPoint.incrementalScorePerUsd).toBeCloseTo(
      (paidPoint.finalScore - freePoint.finalScore) / (paidPoint.usd - freePoint.usd),
      10,
    )
    expect(paidPoint.metricValue).toBe(paidPoint.incrementalScorePerUsd)
  })

  it('rejects scan values that create an invalid scenario', async () => {
    await expect(runSensitivity(DEFAULT_SCENARIO, {
      parameter: 'battle.alpha',
      metric: 'finalScoreGap',
      min: -1,
      max: -1,
      step: 1,
      targetGuildId: 'A',
      runs: 1,
      seed: 1,
    })).rejects.toThrow(/alpha|初始粉丝指数/)
  })

  it('rejects non-finite or impractically large scan grids', async () => {
    await expect(runSensitivity(DEFAULT_SCENARIO, {
      parameter: 'battle.alpha',
      metric: 'finalScoreGap',
      min: 0,
      max: Number.POSITIVE_INFINITY,
      step: 0.01,
      targetGuildId: 'A',
      runs: 1,
      seed: 1,
    })).rejects.toThrow(/有限|finite|扫描/)
  })
})
