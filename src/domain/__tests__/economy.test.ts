import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import {
  activateOffer,
  advanceEconomy,
  aggregateSpend,
  createEconomyState,
  type SpendEvent,
} from '../economy'

const actor = { guildId: 'A', playerId: 'A-1', tier: 'normal' as const }

describe('fan recovery economy', () => {
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
