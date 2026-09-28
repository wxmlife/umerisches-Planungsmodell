import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import { createPurchaseScenario } from '../../test/fixtures'
import { runSeason } from '../season'
import { createSeededRng } from '../rng'
import {
  activateOffer,
  advanceEconomy,
  aggregateSpend,
  createEconomyState,
  type SpendEvent,
} from '../economy'

const actor = { guildId: 'A', playerId: 'A-1', tier: 'normal' as const }

describe('fan recovery economy', () => {
  it.each(['usdCost', 'diamondCost', 'adCost'] as const)('rejects the entire mixed purchase when %s exceeds unlocked funds', (field) => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 6, versionDiamondBudget: 6, versionAdBudget: 6, useAds: true })
    const offer = scenario.supply.offers[0]
    Object.assign(offer, { usdCost: 1, diamondCost: 1, adCost: 1 })
    offer[field] = field === 'usdCost' ? 1.01 : 2
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents.filter((event) => event.minute < 1440)).toEqual([])
    expect(result.spendEvents[0]).toMatchObject({ minute: 1440, usd: offer.usdCost, diamonds: offer.diamondCost, ads: offer.adCost })
    expect(result.snapshots.find((snapshot) => snapshot.minute === 1380))
      .toMatchObject({ cumulativeUsd: 0, cumulativeDiamonds: 0, cumulativeAds: 0 })
  })

  it.each(['all-enabled', 'switch-off', 'zero-budget', 'daily-limit', 'omitted-priority'])('requires all four advertising gates: %s', (gate) => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 0, versionAdBudget: 12, useAds: true })
    Object.assign(scenario.supply.offers[0], { usdCost: 0, adCost: 1 })
    const policy = scenario.guilds[0].purchasePolicies.normal
    if (gate === 'switch-off') policy.useAds = false
    if (gate === 'zero-budget') policy.versionAdBudget = 0
    if (gate === 'daily-limit') scenario.supply.adDailyLimit = 0
    if (gate === 'omitted-priority') policy.supplyPriority = []
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(aggregateSpend(result.spendEvents).ads).toBe(gate === 'all-enabled' ? 12 : 0)
  })

  it('enforces and resets the daily ad cap independently of the version cap', () => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 0, versionAdBudget: 60, useAds: true })
    Object.assign(scenario.supply.offers[0], { usdCost: 0, adCost: 1 })
    scenario.supply.adDailyLimit = 1
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents.map((event) => event.minute)).toEqual([0, 1440, 2880, 4320, 5760, 7200])
  })

  it.each(['diamond', 'ad'] as const)('floors cumulative %s unlocks and allows integer rollover', (currency) => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 0, versionDiamondBudget: 11, versionAdBudget: 11, useAds: true })
    scenario.supply.adDailyLimit = 100
    Object.assign(scenario.supply.offers[0], { usdCost: 0, diamondCost: currency === 'diamond' ? 1 : 0, adCost: currency === 'ad' ? 1 : 0 })
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents.map((event) => event.minute)).toEqual([0, 1440, 1440, 2880, 2880, 4320, 4320, 5760, 5760, 7200, 7200])
  })

  it('allows only the existing epsilon tolerance for dollar comparisons', () => {
    const scenario = createPurchaseScenario()
    scenario.supply.offers[0].usdCost = 1 + 5e-10
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents[0]?.minute).toBe(0)
  })
  it('restores exactly one capacity over 24 hours with fractional carry', () => {
    const state = createEconomyState(0, 2000)
    const next = advanceEconomy(
      state,
      0,
      1440,
      DEFAULT_SCENARIO.fans,
      DEFAULT_SCENARIO.supply,
    )
    expect(next.availableFans).toBe(2000)
    expect(next.recoveredBySource.natural).toBe(2000)
  })

  it('scales ad recovery from capacity instead of hard-coded fans', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.fans.capacity = 4000
    scenario.fans.naturalCapacityPerDay = 0
    let state = createEconomyState(0, 4000)
    state = activateOffer(
      state,
      'ad-or-diamond-ad',
      0,
      scenario.supply,
      actor,
    )
    state = advanceEconomy(state, 0, 30, scenario.fans, scenario.supply)
    expect(state.availableFans).toBe(2000)
    expect(state.spendLedger[0]).toMatchObject({ usd: 0, diamonds: 0, ads: 1 })
  })

  it('wastes overflow and queues a second accelerator rather than stacking it', () => {
    let state = createEconomyState(1800, 2000)
    state = activateOffer(state, 'flyer', 0, DEFAULT_SCENARIO.supply, actor)
    state = activateOffer(state, 'cheer-stick', 0, DEFAULT_SCENARIO.supply, actor)
    expect(state.wastedFans).toBe(800)
    expect(state.queue.map((entry) => entry.offerId)).toEqual(['cheer-stick'])
  })

  it('does not bank continuous recovery produced while already full', () => {
    const fans = { ...DEFAULT_SCENARIO.fans, naturalCapacityPerDay: 0 }
    let state = createEconomyState(2000, 2000)
    state = activateOffer(
      state,
      'ad-or-diamond-ad',
      0,
      DEFAULT_SCENARIO.supply,
      actor,
    )
    state = advanceEconomy(state, 0, 10, fans, DEFAULT_SCENARIO.supply)
    state.availableFans -= 500
    state = advanceEconomy(state, 10, 11, fans, DEFAULT_SCENARIO.supply)
    expect(state.availableFans).toBe(1533)
    expect(state.wastedBySource['ad-or-diamond-ad']).toBeGreaterThanOrEqual(333)
  })

  it('keeps mixed-source attribution identical for one jump and minute steps', () => {
    const createActive = () => activateOffer(
      createEconomyState(1900, 2000),
      'ad-or-diamond-ad',
      0,
      DEFAULT_SCENARIO.supply,
      actor,
    )
    const oneJump = advanceEconomy(
      createActive(), 0, 30, DEFAULT_SCENARIO.fans, DEFAULT_SCENARIO.supply,
    )
    let minuteSteps = createActive()
    for (let minute = 0; minute < 30; minute += 1) {
      minuteSteps = advanceEconomy(
        minuteSteps,
        minute,
        minute + 1,
        DEFAULT_SCENARIO.fans,
        DEFAULT_SCENARIO.supply,
      )
    }

    expect(oneJump.availableFans).toBe(minuteSteps.availableFans)
    expect(oneJump.recoveredBySource).toEqual(minuteSteps.recoveredBySource)
    for (const source of ['natural', 'ad-or-diamond-ad']) {
      expect(oneJump.wastedBySource[source]).toBeCloseTo(
        minuteSteps.wastedBySource[source],
        9,
      )
      expect(oneJump.fractionalFansBySource[source]).toBeCloseTo(
        minuteSteps.fractionalFansBySource[source],
        9,
      )
    }
  })

  it('produces the same queued pulse result in one jump or boundary-sized jumps', () => {
    const fans = { ...DEFAULT_SCENARIO.fans, naturalCapacityPerDay: 0 }
    const createQueued = () => {
      let state = createEconomyState(0, 2000)
      state = activateOffer(state, 'flyer', 0, DEFAULT_SCENARIO.supply, actor)
      return activateOffer(state, 'cheer-stick', 0, DEFAULT_SCENARIO.supply, actor)
    }

    const oneJump = advanceEconomy(createQueued(), 0, 40, fans, DEFAULT_SCENARIO.supply)
    let split = advanceEconomy(createQueued(), 0, 10, fans, DEFAULT_SCENARIO.supply)
    split.availableFans = 0
    split = advanceEconomy(split, 10, 20, fans, DEFAULT_SCENARIO.supply)
    split.availableFans = 0
    split = advanceEconomy(split, 20, 30, fans, DEFAULT_SCENARIO.supply)
    split.availableFans = 0
    split = advanceEconomy(split, 30, 40, fans, DEFAULT_SCENARIO.supply)

    expect(oneJump.theoreticalBySource).toEqual(split.theoreticalBySource)
    expect(oneJump.activeProgram).toEqual(split.activeProgram)
    expect(oneJump.queue).toEqual(split.queue)
  })

  it('applies instant fixed-fan offers without occupying the program queue', () => {
    const state = activateOffer(
      createEconomyState(1700, 2000),
      'instant-600',
      15,
      DEFAULT_SCENARIO.supply,
      actor,
    )
    expect(state.availableFans).toBe(2000)
    expect(state.wastedBySource['instant-600']).toBe(300)
    expect(state.activeProgram).toBeNull()
    expect(state.queue).toEqual([])
  })

  it('reconciles cumulative cash, diamonds, and ads at a cutoff', () => {
    const events: SpendEvent[] = [
      { minute: 0, guildId: 'A', playerId: 'A-1', tier: 'whale', offerId: 'flyer', usd: 0.99, diamonds: 0, ads: 0 },
      { minute: 30, guildId: 'A', playerId: 'A-2', tier: 'normal', offerId: 'ad', usd: 0, diamonds: 0, ads: 1 },
      { minute: 60, guildId: 'B', playerId: 'B-1', tier: 'small', offerId: 'diamond', usd: 0, diamonds: 20, ads: 0 },
    ]
    expect(aggregateSpend(events, 30)).toEqual({ usd: 0.99, diamonds: 0, ads: 1 })
  })
})
