import { describe, expect, it, vi } from 'vitest'
import * as compiler from '../formula/compiler'
import { DEFAULT_SCENARIO } from '../defaults'
import { createSeededRng } from '../rng'
import { runSeason } from '../season'
import { aggregateSpend } from '../economy'
import { createFormulaScenario, createPurchaseScenario } from '../../test/fixtures'

describe('formula-driven season decisions', () => {
  it('reproduces the new Bernoulli fixed-seed six-day baseline', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(20_260_924), 'stochastic')
    expect(result.termination).toBe('season-end')
    expect(result.eventCount).toBe(15022)
    const battles = result.events.filter((event) => event.type === 'battle')
    expect(battles).toHaveLength(7783)
    expect(battles.filter((event) => event.attackerWon)).toHaveLength(6808)
    const expected = {
      A: [30156, 3076.39166666667, 33232.39166666667],
      B: [26636, 135.84999999999934, 26771.85],
      C: [42766, 217.7500000000095, 42983.75000000001],
      D: [24667, 51.74166666666571, 24718.741666666665],
    }
    for (const [id, [attack, holding, total]] of Object.entries(expected)) {
      expect(result.guilds[id].attackScore).toBe(attack)
      expect(result.guilds[id].holdingScore).toBeCloseTo(holding, 8)
      expect(result.guilds[id].totalScore).toBeCloseTo(total, 8)
    }
  })
  it.each([[0, 'normal-01', 'deploy'], [1, 'core-01', 'battle']] as const)(
    'uses probability %s in both target utility and the selected battle', (probability, nodeId, type) => {
      const scenario = createFormulaScenario()
      scenario.battle.formulas = { ...scenario.battle.formulas, winProbability: String(probability) }
      const result = runSeason(scenario, createSeededRng(11), 'deterministic')
      const firstB = result.events.find((event) => event.guildId === 'B')
      expect(firstB).toMatchObject({ minute: 0, type, nodeId })
      if (probability === 1) expect(firstB?.attackerWon).toBe(true)
    },
  )

  it('uses editable effective power when choosing a defended target', () => {
    const scenario = createFormulaScenario()
    scenario.guilds[0].roster = { normal: 0, small: 0, whale: 1 }
    scenario.battle.formulas = { ...scenario.battle.formulas, preRandomPower: '1' }
    const result = runSeason(scenario, createSeededRng(11), 'deterministic')
    expect(result.events.find((event) => event.guildId === 'B')).toMatchObject({ type: 'battle', nodeId: 'core-01', attackerWon: false })
  })

  it('compiles the four formulas once while evaluating many targets and battles', () => {
    const compile = vi.spyOn(compiler, 'compileFormula')
    try {
      const result = runSeason(DEFAULT_SCENARIO, createSeededRng(11), 'deterministic')
      expect(result.events.filter((event) => event.type === 'battle').length).toBeGreaterThan(10)
      expect(compile.mock.calls.map(([id]) => id).sort()).toEqual(['displayedTendency', 'fanLoss', 'preRandomPower', 'winProbability'])
    } finally { compile.mockRestore() }
  })

  it('labels compile errors with the season execution context', () => {
    const scenario = createFormulaScenario()
    scenario.battle.formulas = { ...scenario.battle.formulas, winProbability: 'currentFans' }
    expect(() => runSeason(scenario, createSeededRng(11), 'deterministic')).toThrow(
      expect.objectContaining({ kind: 'formula', code: 'UNKNOWN_IDENTIFIER', context: 'deterministic' }),
    )
  })
})

describe('six-day season engine', () => {
  it.each([
    [0, 1], [1439, 1], [1440, 2], [8639, 6], [8640, 6],
  ])('unlocks exactly the cumulative dollar allowance at minute %s', (minute, allowance) => {
    for (const [cost, allowed] of [[allowance, true], [allowance + 0.01, false]] as const) {
      const scenario = createPurchaseScenario()
      scenario.fans.attackCooldownMinutes = minute
      scenario.supply.offers[0].usdCost = cost
      const result = runSeason(scenario, createSeededRng(1), 'deterministic')
      expect(result.spendEvents.some((event) => event.minute === minute)).toBe(allowed)
    }
  })

  it('carries unused allowance forward without resetting version spending each day', () => {
    const scenario = createPurchaseScenario()
    scenario.supply.offers[0].usdCost = 2
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents.map((event) => event.minute)).toEqual([1440, 4320, 7200])
    expect(aggregateSpend(result.spendEvents).usd).toBe(6)
    expect(result.snapshots.at(-1)?.cumulativeUsd).toBe(6)
  })

  it('uses the configured season length while preserving the total version budget', () => {
    const scenario = createPurchaseScenario()
    scenario.season.days = 3
    scenario.season.centerUnlockDay = 3
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents.map((event) => event.minute)).toEqual([0, 0, 1440, 1440, 2880, 2880])
  })

  it('resets product daily limits while retaining cumulative spending', () => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 60 })
    scenario.supply.offers[0].dailyPurchaseLimit = 1
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.spendEvents.map((event) => event.minute)).toEqual([0, 1440, 2880, 4320, 5760, 7200])
  })

  it('honors different budgets for the same tier in separate guilds', () => {
    const scenario = createPurchaseScenario()
    scenario.guilds.push({ ...structuredClone(scenario.guilds[0]), id: 'B', name: 'B' })
    scenario.guilds[1].purchasePolicies.normal.versionUsdBudget = 0
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(aggregateSpend(result.spendEvents.filter((event) => event.guildId === 'A')).usd).toBe(6)
    expect(result.spendEvents.filter((event) => event.guildId === 'B')).toEqual([])
  })
  it('lets the default 999 formation slots behave as effectively unbounded', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.season.nodeCounts = { normal: 3, core: 0, center: 0 }
    scenario.guilds = [scenario.guilds[0]]
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.guilds.A.maxSimultaneousGarrisons).toBe(3)
  })

  it('honors a manually reduced one-slot formation limit', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.fans.formationSlots = 1
    scenario.season.nodeCounts = { normal: 3, core: 0, center: 0 }
    scenario.guilds = [scenario.guilds[0]]
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.guilds.A.maxGarrisonsPerPlayer).toBe(1)
    expect(result.guilds.A.actionCapacityBlocks.formation).toBeGreaterThan(0)
  })

  it('recomputes recovery readiness when defeated fans return to the pool', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    for (const guild of scenario.guilds) {
      for (const policy of Object.values(guild.purchasePolicies)) policy.supplyPriority = []
    }
    scenario.season.days = 1
    scenario.season.centerUnlockDay = 1
    scenario.season.nodeCounts = { normal: 2, core: 0, center: 0 }
    scenario.guilds = [
      {
        ...structuredClone(scenario.guilds[0]),
        roster: { normal: 0, small: 0, whale: 1 },
        deployFans: { normal: 2000, core: 2000, center: 2000 },
      },
      {
        ...structuredClone(scenario.guilds[1]),
        roster: { normal: 3, small: 0, whale: 0 },
        deployFans: { normal: 2000, core: 2000, center: 2000 },
      },
    ]

    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    const laterActions = result.events.filter((event) => (
      event.playerId === 'A-whale-1' && event.minute > 235
    ))

    expect(laterActions[0]?.minute).toBe(466)
    expect(result.guilds.A.totalScore).toBeGreaterThan(25)
  })

  it('does not award battle score for neutral deployment or defender success', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(2), 'deterministic')
    for (const guild of Object.values(result.guilds)) {
      expect(guild.totalScore).toBeCloseTo(guild.attackScore + guild.holdingScore, 8)
      expect(guild.defenderGuildScore).toBe(0)
    }
  })

  it('settles holding score by elapsed time and opens center only on day six', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(3), 'deterministic')
    expect(result.events.find((event) => event.nodeKind === 'center')?.minute)
      .toBeGreaterThanOrEqual(5 * 1440)
    expect(result.invariants.holdingScoreReconciled).toBe(true)
    for (const guildId of Object.keys(result.guilds)) {
      const scores = result.snapshots
        .filter((snapshot) => snapshot.guildId === guildId)
        .map((snapshot) => snapshot.totalScore)
      expect(scores.every((score, index) => index === 0 || score >= scores[index - 1])).toBe(true)
    }
  })

  it('terminates cleanly when nobody has fans or a valid target', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.fans.naturalCapacityPerDay = 0
    scenario.guilds.forEach((guild) => {
      guild.deployFans = { normal: 2000, core: 2000, center: 2000 }
    })
    const result = runSeason(scenario, createSeededRng(4), 'deterministic')
    expect(result.eventCount).toBeLessThan(
      scenario.simulation.maxEventsPerDay * scenario.season.days,
    )
    expect(result.termination).toBe('season-end')
  })

  it('keeps node ownership and fan balances valid throughout a season', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(5), 'stochastic')
    expect(result.invariants).toMatchObject({
      singleOwnerPerNode: true,
      nonnegativeFans: true,
      holdingScoreReconciled: true,
    })
    expect(result.snapshots.at(-1)?.minute).toBe(DEFAULT_SCENARIO.season.days * 1440)
  })
})
