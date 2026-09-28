import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import { calculateLegacyRewardAudit, calculateRewardModel } from '../rewards'
import { aggregateRewardModels } from '../aggregate'
import { runSeason, type SeasonEvent, type SeasonResult } from '../season'
import { createSeededRng } from '../rng'
import type { NodeKind, Scenario } from '../types'
import { createFormulaScenario } from '../../test/fixtures'

function fixture(count = 1): { scenario: Scenario; season: SeasonResult } {
  const scenario = structuredClone(DEFAULT_SCENARIO)
  scenario.guilds = scenario.guilds.slice(0, 1)
  scenario.guilds[0].roster = { normal: count, small: 0, whale: 0 }
  const season: SeasonResult = {
    mode: 'deterministic', seasonStartRoster: Array.from({ length: count }, (_, i) => ({ playerId: `A-normal-${i + 1}`, guildId: 'A', tier: 'normal' })),
    guilds: { A: { totalScore: 100, attackScore: 100, holdingScore: 0, defenderGuildScore: 0, personalDefenseContribution: 0, maxSimultaneousGarrisons: 0, maxGarrisonsPerPlayer: 0, actionCapacityBlocks: { formation: 0, cooldown: 0 }, returnedOverflowFans: 0, supplyBySource: {} } },
    events: [], snapshots: [], spendEvents: [], eventCount: 0, termination: 'season-end', terminationMinute: null,
    invariants: { singleOwnerPerNode: true, nonnegativeFans: true, holdingScoreReconciled: true },
  }
  return { scenario, season }
}

function battle(id: string, day: number, kind: NodeKind = 'normal', won = false, playerId = 'A-normal-1'): SeasonEvent {
  return { id, type: 'battle', minute: (day - 1) * 1440 + 1, day, playerId, guildId: playerId.split('-')[0], nodeKind: kind, nodeId: `${kind}-1`, attackerWon: won }
}

// Exact 100-point normal losses keep threshold checks independent of reward configuration.
function points(season: SeasonResult, amount: number, playerId = 'A-normal-1') {
  for (let n = 0; n < amount / 100; n++) season.events.push(battle(`${playerId}-${n}`, Math.floor(n / 220) + 1, 'normal', false, playerId))
}

describe('six-day reward settlement', () => {
  it.each([
    [1000, { 90: 20 }], [5600, { 2: 20, 5: 10 }], [10000, { 90: 20, 91: 20 }],
    [18900, { 2: 20, 5: 10, 90: 20 }], [25500, { 2: 20, 5: 10 }],
    [35500, { 2: 20, 90: 20, 91: 20 }], [43700, { 2: 20, 5: 10, 90: 20 }],
    [56200, { 2: 20, 5: 10 }], [66100, { 2: 20, 90: 20, 91: 20 }],
    [81000, { 2: 20, 5: 10, 90: 20 }], [92600, { 2: 20, 5: 10, 90: 20 }],
    [110000, { 2: 20, 5: 20, 90: 40, 91: 20 }],
  ])('unlocks exactly the stage at %i with its audited resource amounts', (threshold, award) => {
    const { scenario, season } = fixture()
    points(season, threshold - 100)
    const before = calculateRewardModel(scenario, season).players[0]
    points(season, threshold) // duplicate event ids must not inflate progress
    const after = calculateRewardModel(scenario, season).players[0]
    const delta = Object.fromEntries(Object.keys(award).map(id => [id, (after.personalRewards[Number(id)] ?? 0) - (before.personalRewards[Number(id)] ?? 0)]))
    expect(after.points).toBe(threshold)
    expect(after.personalStagesUnlocked).toBe(before.personalStagesUnlocked + 1)
    expect(delta).toEqual(award)
  })

  it.each([['normal', false, 100], ['normal', true, 500], ['core', false, 150], ['core', true, 800], ['center', false, 200], ['center', true, 3000]] as const)('awards %s / %s points from battle outcomes', (kind, won, expected) => {
    const { scenario, season } = fixture()
    season.events.push(battle('one', 1, kind, won))
    expect(calculateRewardModel(scenario, season).players[0].points).toBe(expected)
  })

  it('caps each member per day; neutral deployments and holding score grant no personal progress', () => {
    const { scenario, season } = fixture(2)
    for (let i = 0; i < 20; i++) season.events.push(battle(`hq-${i}`, 1, 'center', true))
    season.events.push({ ...battle('neutral', 2), type: 'deploy' }, battle('other', 1, 'center', true, 'A-normal-2'))
    season.guilds.A.holdingScore = 1e9
    const result = calculateRewardModel(scenario, season)
    expect(result.players[0]).toMatchObject({ points: 22000, dailyPoints: [22000, 0, 0, 0, 0, 0], activeDays: 1, rankEligible: false })
    expect(result.players[1].points).toBe(3000)
    expect(result.guilds.A.completionRate).toBeCloseTo(25000 / 220000)
  })

  it('requires three distinct active days and 44000 progress; defense counts at most once per day without progress', () => {
    const { scenario, season } = fixture(2)
    points(season, 44000)
    expect(calculateRewardModel(scenario, season).players[0].rankEligible).toBe(false)
    const defense = { ...battle('defense', 3, 'normal', false, 'A-normal-2'), defenderPlayerId: 'A-normal-1', defenderGuildId: 'A', defenseContribution: 5 }
    season.events.push(defense, defense, { ...defense, id: 'second-defense' })
    const result = calculateRewardModel(scenario, season).players[0]
    expect(result).toMatchObject({ points: 44000, activeDays: 3, defenseActiveDays: 1, rankEligible: true })
    const below = fixture()
    points(below.season, 43900)
    below.season.events.push({ ...battle('defense', 3, 'normal', false, 'outsider'), defenderPlayerId: 'A-normal-1', defenderGuildId: 'A', defenseContribution: 5 })
    expect(calculateRewardModel(below.scenario, below.season).players[0].rankEligible).toBe(false)
  })

  it('uses per-capita locked roster progress and each milestone personal threshold', () => {
    const { scenario, season } = fixture(2)
    points(season, 132000)
    points(season, 11000, 'A-normal-2')
    const result = calculateRewardModel(scenario, season)
    expect(result.guilds.A.completionRate).toBe(0.55)
    expect(result.guilds.A.milestonesUnlocked).toBe(2)
    expect(result.players[0].guildRewards).toEqual({ 2: 20, 5: 10, 90: 20 })
    expect(result.players[1].guildRewards).toEqual({ 2: 10, 90: 10 })
    expect(result.players[1].rankRewards).toEqual({})
  })

  it('locks original membership despite transfer, departure, and new members', () => {
    const { scenario, season } = fixture(2)
    points(season, 110000)
    season.events.forEach(event => { event.guildId = 'B' })
    points(season, 110000, 'B-new-1')
    scenario.guilds[0].roster.normal = 0
    scenario.guilds.push({ ...structuredClone(scenario.guilds[0]), id: 'B', roster: { normal: 3, small: 0, whale: 0 } })
    const result = calculateRewardModel(scenario, season)
    expect(result.players).toHaveLength(2)
    expect(result.players[0]).toMatchObject({ guildId: 'A', points: 110000 })
    expect(result.guilds.A.memberCount).toBe(2)
    expect(result.guilds.A.completionRate).toBe(0.5)
    expect(result.players[1].totalRewards).toEqual({})
  })

  it('settles exact 52-member C/A/B/D issuance and the legacy-free replacement delta', () => {
    const { season } = fixture()
    const scenario = structuredClone(DEFAULT_SCENARIO)
    season.seasonStartRoster = scenario.guilds.flatMap(guild => Object.entries(guild.roster).flatMap(([tier, count]) => Array.from({ length: count }, (_, i) => ({ playerId: `${guild.id}-${tier}-${i + 1}`, guildId: guild.id, tier: tier as 'normal' | 'small' | 'whale' }))))
    const template = season.guilds.A
    season.guilds = Object.fromEntries(['C', 'A', 'B', 'D'].map((id, i) => [id, { ...structuredClone(template), totalScore: 400 - i * 100 }]))
    season.seasonStartRoster.forEach(player => points(season, 110000, player.playerId))
    const result = calculateRewardModel(scenario, season)
    expect(result.issuance).toMatchObject({ 2: 12480, 90: 13205, 91: 5200, 5: 5720, 601: 52 })
    expect(result.legacyFreeDelta).toEqual({ 2: 0, 5: 0, 90: -315, 91: 0 })
    expect(result.sources.legacyFree).toEqual({})
    const champion = result.players.find(player => player.guildId === 'C')!
    expect(champion.personalRewards).toEqual({ 2: 200, 90: 200, 91: 80, 5: 90 })
    expect(champion.guildRewards).toEqual({ 2: 40, 90: 40, 91: 20, 5: 20 })
    expect(champion.title).toMatchObject({ resourceId: 601, quantity: 1, extra: { titleId: null, label: '冠军聊天称号' } })
    expect(result.audit.legacyProgressThreshold).toBe(664000)
    expect(result.audit.targetPoints).toBe(110000)
    expect(result.settlementTiming).toBe('season-end')
    scenario.rewards.legacyFreeMode = 'stack'
    expect(calculateRewardModel(scenario, season).issuance).toMatchObject({ 2: 24960, 90: 26725, 91: 10400, 5: 11440 })
  })

  it('shares occupied ranks with half-up mean merit independent of input order', () => {
    const { scenario, season } = fixture()
    const original = season.guilds.A
    season.guilds.B = { ...structuredClone(original), totalScore: 100 }
    season.seasonStartRoster.push({ playerId: 'B-normal-1', guildId: 'B', tier: 'normal' })
    points(season, 110000)
    points(season, 110000, 'B-normal-1')
    const result = calculateRewardModel(scenario, season)
    expect(result.guilds.A).toMatchObject({ occupiedRanks: [1, 2], rankMerit: 18 })
    expect(result.guilds.B).toMatchObject({ occupiedRanks: [1, 2], rankMerit: 18 })
    expect(result.players.map(player => player.rankRewards[90])).toEqual([18, 18])
    season.guilds = { B: season.guilds.B, A: season.guilds.A }
    expect(calculateRewardModel(scenario, season)).toEqual(result)
  })

  it('returns zero for empty and inactive rosters and rejects truncated seasons', () => {
    const { scenario, season } = fixture(0)
    expect(calculateRewardModel(scenario, season)).toMatchObject({ completionRate: 0, eligibleCount: 0, issuance: {}, guilds: { A: { completionRate: 0 } } })
    season.termination = 'event-limit'
    expect(() => calculateRewardModel(scenario, season)).toThrow(/未完成|truncated/)
  })

  it('emits an authoritative battle ledger and never feeds reward edits back into the season', () => {
    const scenario = createFormulaScenario()
    const original = structuredClone(scenario)
    const season = runSeason(scenario, createSeededRng(2), 'deterministic')
    const battles = season.events.filter(event => event.type === 'battle')
    expect(battles.length).toBeGreaterThan(0)
    expect(battles[0]).toMatchObject({ id: expect.any(String), defenderPlayerId: expect.any(String), defenderGuildId: expect.any(String), defenseContribution: expect.any(Number) })
    expect(new Set(battles.map(event => event.id)).size).toBe(battles.length)
    const snapshot = structuredClone(season)
    expect(calculateRewardModel(scenario, season).mode).toBe('deterministic')
    expect(season).toEqual(snapshot)
    expect(scenario).toEqual(original)
    scenario.rewards.personalStages[0].rewards.push({ resourceId: 92, quantity: 99999 })
    expect(runSeason(scenario, createSeededRng(2), 'deterministic')).toEqual(snapshot)
  })
})

describe('legacy source audit', () => {
  it('keeps exact pass rewards, lifetime red pockets and finite/unlimited shop sources separate', () => {
    const result = calculateLegacyRewardAudit({ freePassClaims: 1, paidPassClaims: 1, iapPurchases: [] })
    expect(result.freePass.issuance).toEqual({ 2: 240, 90: 260, 91: 100, 5: 110 })
    expect(result.paidPass.issuance).toEqual({ 2: 1300, 3: 220000, 5: 250, 10: 5, 63: 110, 64: 35, 92: 10 })
    expect(result.paidPass.settlementTiming).toBe('season-end')
    expect(result.redPocket).toMatchObject({ basis: 'lifetime-once', perPlayerTheoretical: { 2: 5480 }, allSeatCap: { 2: 102400 }, claimSeats: 1165 })
    expect(result.shop).toMatchObject({ basis: 'exchange-not-free-issuance', finiteMeritCost: 137700 })
    expect(result.shop.unlimitedExchanges.map(exchange => exchange.meritCost)).toEqual([300, 3000, 200])
    expect(result).not.toHaveProperty('totalValue')
    expect(result).not.toHaveProperty('totalIssuance')
  })

  it('scales passes and each IAP event by its own effective membership without mixing resource ids', () => {
    const result = calculateLegacyRewardAudit({ freePassClaims: 2, paidPassClaims: 3, iapPurchases: [
      { itemId: 2202, purchases: 2, effectiveMembers: 11 }, { itemId: 2203, purchases: 3, effectiveMembers: 20 },
      { itemId: 2204, purchases: 1, effectiveMembers: 10 }, { itemId: 2205, purchases: 2, effectiveMembers: 10 }, { itemId: 2206, purchases: 0, effectiveMembers: 52 },
    ], redPocket: { perPlayerClaims: [{ resourceId: 2, quantity: 10 }], allSeatClaims: [{ resourceId: 2, quantity: 30 }], claimSeats: 3 }, shop: { finiteMeritCost: 100, finiteInventory: [{ resourceId: 5, label: '公司升级券', quantity: 2 }], unlimitedExchanges: [] } })
    expect(result.freePass.issuance[2]).toBe(480)
    expect(result.paidPass.issuance[92]).toBe(30)
    expect(result.iapAllMember.issuance).toEqual({ 92: 142, 64: 10, 19: 20 })
    expect(result.iapAllMember.purchases[0].issuance).toEqual({ 92: 22 })
    expect(result.redPocket.allSeatCap).toEqual({ 2: 30 })
    expect(result.shop.finiteMeritCost).toBe(100)
    expect(() => calculateLegacyRewardAudit({ freePassClaims: -1, paidPassClaims: 0, iapPurchases: [] })).toThrow()
  })
})

describe('reward distribution aggregation', () => {
  it('reports interpolated P10/P50/P90 completion, eligibility, milestones and per-resource issuance', () => {
    const { scenario, season } = fixture()
    season.mode = 'stochastic'
    const empty = calculateRewardModel(scenario, season)
    points(season, 110000)
    const full = calculateRewardModel(scenario, season)
    const result = aggregateRewardModels([empty, full])
    expect(result.mode).toBe('monte-carlo')
    expect(result.completionRate).toEqual({ p10: 0.1, median: 0.5, p90: 0.9, mean: 0.5 })
    expect(result.eligibleCount).toEqual({ p10: 0.1, median: 0.5, p90: 0.9, mean: 0.5 })
    expect(result.issuance[2]).toEqual({ p10: 24, median: 120, p90: 216, mean: 120 })
    expect(result.guilds.A.milestoneAchievementRates).toHaveLength(4)
    expect(result.tiers.normal.averageRewards[90].median).toBe(130)
    expect(aggregateRewardModels([])).toMatchObject({ runs: 0, issuance: {}, completionRate: { median: 0 } })
    expect(() => aggregateRewardModels([{ ...full, mode: 'deterministic' }])).toThrow(/stochastic|随机/)
  })
})
