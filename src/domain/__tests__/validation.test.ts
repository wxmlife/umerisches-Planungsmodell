import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import { validateScenario } from '../validation'

describe('scenario defaults and validation', () => {
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
    scenario.supply.purchasePolicies.normal.supplyPriority[0] = 'missing-offer'
    const paths = validateScenario(scenario).issues.map((issue) => issue.path)
    expect(paths).toContain('guilds.1.id')
    expect(paths).toContain('supply.offers.1.id')
    expect(paths).toContain('supply.purchasePolicies.normal.supplyPriority.0')
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
