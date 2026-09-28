import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import { validateScenario } from '../validation'
import { createPurchaseScenario } from '../../test/fixtures'

describe('scenario defaults and validation', () => {
  it('validates reward thresholds, quantities, ids, cap, eligibility, and rank configuration', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    expect(scenario.rewards).toBeDefined()
    scenario.rewards.dailyPointCap = 0
    scenario.rewards.personalStages[1].points = scenario.rewards.personalStages[0].points
    scenario.rewards.personalStages[0].rewards[0].quantity = -1
    scenario.rewards.personalStages[2].rewards[0].resourceId = 94
    scenario.rewards.guildMilestones[0].completionRate = 2
    scenario.rewards.rankMinActiveDays = -1
    scenario.rewards.rankRewards[0].merit = 1.5
    const paths = validateScenario(scenario).issues.map(issue => issue.path)
    expect(paths).toEqual(expect.arrayContaining(['rewards.dailyPointCap', 'rewards.personalStages.1.points', 'rewards.personalStages.0.rewards.0.quantity', 'rewards.personalStages.2.rewards.0.resourceId', 'rewards.guildMilestones.0.completionRate', 'rewards.rankMinActiveDays', 'rewards.rankRewards.0.merit']))
  })

  it('gives every guild independent copies of the approved six-day tier templates', () => {
    const normal = ['ad-or-diamond-ad', 'ad-or-diamond-diamond', 'flyer', 'cheer-stick', 'instant-2000', 'instant-1000', 'instant-600']
    const paid = ['flyer', 'cheer-stick', 'instant-2000', 'instant-1000', 'instant-600', 'ad-or-diamond-ad', 'ad-or-diamond-diamond']
    for (const guild of DEFAULT_SCENARIO.guilds) {
      expect(guild.purchasePolicies).toEqual({
        normal: { versionUsdBudget: 0, versionDiamondBudget: 120, versionAdBudget: 12, useAds: true, supplyPriority: normal },
        small: { versionUsdBudget: 24, versionDiamondBudget: 0, versionAdBudget: 0, useAds: false, supplyPriority: paid },
        whale: { versionUsdBudget: 90, versionDiamondBudget: 0, versionAdBudget: 0, useAds: false, supplyPriority: paid },
      })
    }
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.guilds[0].purchasePolicies.normal.supplyPriority.pop()
    scenario.guilds[0].purchasePolicies.small.versionUsdBudget = 1
    expect(scenario.guilds[1].purchasePolicies.normal.supplyPriority).toEqual(normal)
    expect(scenario.guilds[1].purchasePolicies.small.versionUsdBudget).toBe(24)
    expect(scenario.guilds[0].purchasePolicies.whale.supplyPriority).toEqual(paid)
  })

  it.each([
    ['versionUsdBudget', -0.01], ['versionUsdBudget', Infinity], ['versionUsdBudget', NaN],
    ['versionDiamondBudget', -1], ['versionDiamondBudget', 0.5], ['versionDiamondBudget', Infinity],
    ['versionAdBudget', -1], ['versionAdBudget', 0.5], ['versionAdBudget', Infinity],
  ] as const)('rejects invalid %s = %s at the guild policy path', (field, value) => {
    const scenario = createPurchaseScenario({ [field]: value })
    expect(validateScenario(scenario).issues.map((issue) => issue.path))
      .toContain(`guilds.0.purchasePolicies.normal.${field}`)
  })

  it('accepts fractional dollars and a legal priority subset, including no purchases', () => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 0.01, supplyPriority: [] })
    expect(validateScenario(scenario)).toEqual({ valid: true, issues: [] })
  })

  it('rejects unknown and duplicate offer priorities per guild and tier', () => {
    const scenario = createPurchaseScenario({ supplyPriority: ['test-supply', 'test-supply', 'missing'] })
    const paths = validateScenario(scenario).issues.map((issue) => issue.path)
    expect(paths).toContain('guilds.0.purchasePolicies.normal.supplyPriority')
    expect(paths).toContain('guilds.0.purchasePolicies.normal.supplyPriority.2')
  })
  it('ships the approved formation and recovery defaults', () => {
    expect(DEFAULT_SCENARIO.fans.formationSlots).toBe(999)
    expect(DEFAULT_SCENARIO.fans.capacity).toBe(2000)
    const ad = DEFAULT_SCENARIO.supply.offers.find(
      (offer) => offer.id === 'ad-or-diamond-ad',
    )
    expect(ad?.continuousCapacityRate).toBe(0.5)
    expect(ad?.durationMinutes).toBe(30)
  })

  it('rejects deployment above capacity without destroying the previous result', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.fans.maxDeploy = 2001
    expect(validateScenario(scenario).issues).toContainEqual({
      path: 'fans.maxDeploy',
      message: '单次最高出战不能超过粉丝池上限',
    })
  })

  it('accepts the approved default scenario', () => {
    expect(validateScenario(DEFAULT_SCENARIO)).toEqual({ valid: true, issues: [] })
  })

  it('rejects duplicate ids and missing offer references', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.guilds[1].id = scenario.guilds[0].id
    scenario.supply.offers[1].id = scenario.supply.offers[0].id
    scenario.guilds[0].purchasePolicies.normal.supplyPriority[0] = 'missing-offer'
    const paths = validateScenario(scenario).issues.map((issue) => issue.path)
    expect(paths).toContain('guilds.1.id')
    expect(paths).toContain('supply.offers.1.id')
    expect(paths).toContain('guilds.0.purchasePolicies.normal.supplyPriority.0')
  })

  it('rejects non-monotonic loss bands and all-zero guild priorities', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.battle.lossBands[2].minRatio = 1.2
    scenario.guilds[0].priorities = { normal: 0, core: 0, center: 0 }
    const paths = validateScenario(scenario).issues.map((issue) => issue.path)
    expect(paths).toContain('battle.lossBands')
    expect(paths).toContain('guilds.0.priorities')
  })
})
