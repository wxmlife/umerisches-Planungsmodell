import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import * as compiler from '../formula/compiler'
import { createSeededRng } from '../rng'
import {
  buildAttritionSeries,
  createBattleRuntime,
  calculatePreRandomPower,
  calculateStyleMultiplier,
  displayTendency,
  resolveBattle,
  resolveLossRate,
  uniformWinProbability,
} from '../battle'

const combatant = { idolPower: 1, initialFans: 1000, currentFans: 1000, styleMultiplier: 1 }

describe('formula-driven battles', () => {
  it('stores the four specified default RHS expressions in the scenario', () => {
    expect(DEFAULT_SCENARIO.battle.formulas).toEqual({
      preRandomPower: 'idolPower <= 0 || initialFans <= 0 || currentFans <= 0 || styleMultiplier <= 0 ? 0 : idolPower * pow(initialFans / 1000, alpha) * pow(currentFans / initialFans, beta) * styleMultiplier',
      displayedTendency: 'attackerPower + defenderPower > 0 ? attackerPower / (attackerPower + defenderPower) : 0.5',
      winProbability: 'uniformWinProbability(attackerPower, defenderPower, randomMin, randomMax)',
      fanLoss: 'round(currentFans * lossBandRate * sideLossFactor)',
    })
  })

  it.each(['idolPower', 'initialFans', 'currentFans', 'styleMultiplier'] as const)(
    'short-circuits zero %s before evaluating an invalid power formula, including beta zero', (field) => {
      const config = { ...DEFAULT_SCENARIO.battle, beta: 0, formulas: { ...DEFAULT_SCENARIO.battle.formulas, preRandomPower: '1 / 0' } }
      expect(calculatePreRandomPower({ ...combatant, [field]: 0 }, config)).toBe(0)
    },
  )

  it.each([
    [1, 0, 1e15], [0, 0, 0], [1e15, 1e-300, 1e15], [1, 2, 0.5],
  ])('passes a finite saturated ratio for powers %s / %s', (attacker, defender, ratio) => {
    const config = { ...DEFAULT_SCENARIO.battle, formulas: { ...DEFAULT_SCENARIO.battle.formulas,
      preRandomPower: 'idolPower', fanLoss: 'attackerToDefenderPowerRatio == ' + ratio + ' ? 7 : 11',
    } }
    const result = resolveBattle(config, { ...combatant, idolPower: attacker }, { ...combatant, idolPower: defender }, { next: () => 0.5 })
    expect([result.attackerLoss, result.defenderLoss]).toEqual([7, 7])
  })

  it('uses all four editable expressions and draws exactly one Bernoulli sample', () => {
    const config = { ...DEFAULT_SCENARIO.battle, formulas: {
      preRandomPower: 'idolPower * 2', displayedTendency: '0.123', winProbability: '0.75',
      fanLoss: 'isDefender ? (attackerWon ? 15.5 : 23.5) : sideLossFactor * 9.5',
    } }
    let draws = 0
    const won = resolveBattle(config, combatant, combatant, { next: () => { draws++; return 0.749 } })
    expect(draws).toBe(1)
    expect(won).toMatchObject({ attackerWon: true, attackerPrePower: 2, defenderPrePower: 2,
      displayedTendency: 0.123, actualWinProbability: 0.75, attackerLoss: 10, defenderLoss: 16 })
    const lost = resolveBattle(config, combatant, combatant, { next: () => 0.75 })
    expect(lost).toMatchObject({ attackerWon: false, defenderLoss: 24 })
  })

  it.each([0, 1])('makes constant probability %s authoritative for sampled battles', (probability) => {
    const config = { ...DEFAULT_SCENARIO.battle, formulas: { ...DEFAULT_SCENARIO.battle.formulas, winProbability: String(probability) } }
    const result = resolveBattle(config, combatant, combatant, { next: () => 0.5 })
    expect(result.actualWinProbability).toBe(probability)
    expect(result.attackerWon).toBe(Boolean(probability))
  })

  it('rounds and caps each challenge branch before taking expected defender loss', () => {
    const config = { ...DEFAULT_SCENARIO.battle, formulas: { ...DEFAULT_SCENARIO.battle.formulas,
      winProbability: '0.25', fanLoss: 'isDefender ? (attackerWon ? 10000 : 1.6) : 99',
    } }
    const rows = buildAttritionSeries(config, { attackerIdolPower: 1, defenderIdolPower: 1,
      attackerInitialFans: 10, defenderInitialFans: 10, battles: 3 })
    expect(rows.map((row) => [row.defenderFans, row.defenderLoss, row.defenderFansAfter])).toEqual([
      [10, 4, 6], [6, 3, 3], [3, 2, 1],
    ])
    expect(rows.map((row) => row.actualWinProbability)).toEqual([0.25, 0.25, 0.25])
  })

  it.each([['1.5', 2], ['1000.4', 1000], ['1e300', 1000]] as const)(
    'rounds then caps finite fan loss %s', (fanLoss, expected) => {
      const config = { ...DEFAULT_SCENARIO.battle, formulas: { ...DEFAULT_SCENARIO.battle.formulas, fanLoss } }
      const result = resolveBattle(config, combatant, combatant, { next: () => 0.5 })
      expect(result.attackerLoss).toBe(expected)
      expect(result.defenderLoss).toBe(expected)
    },
  )

  it.each([['-1', 'OUTPUT_RANGE'], ['1 / 0', 'DIVIDE_BY_ZERO'], ['exp(1000)', 'NON_FINITE'], ['sqrt(-1)', 'FUNCTION_DOMAIN']])(
    'rejects invalid loss %s without masking it', (fanLoss, code) => {
      const config = { ...DEFAULT_SCENARIO.battle, formulas: { ...DEFAULT_SCENARIO.battle.formulas, fanLoss } }
      expect(() => resolveBattle(config, combatant, combatant, { next: () => 0.5 }))
        .toThrow(expect.objectContaining({ kind: 'formula', formulaId: 'fanLoss', code, context: 'deterministic' }))
    },
  )

  it('short-circuits fan loss when both combatants have no fans', () => {
    const config = { ...DEFAULT_SCENARIO.battle, beta: 0, formulas: { ...DEFAULT_SCENARIO.battle.formulas, fanLoss: '1 / 0' } }
    const result = resolveBattle(config, { ...combatant, currentFans: 0 }, { ...combatant, currentFans: 0 }, { next: () => 0.5 })
    expect(result).toMatchObject({ attackerPrePower: 0, defenderPrePower: 0, attackerLoss: 0, defenderLoss: 0 })
  })

  it('compiles each formula only once across a long challenge series', () => {
    const compile = vi.spyOn(compiler, 'compileFormula')
    try {
      const rows = buildAttritionSeries(DEFAULT_SCENARIO.battle, {
        attackerIdolPower: 1, defenderIdolPower: 3, attackerInitialFans: 1000, defenderInitialFans: 1000, battles: 50,
      })
      expect(rows).toHaveLength(50)
      expect(compile.mock.calls.map(([id]) => id).sort()).toEqual(['displayedTendency', 'fanLoss', 'preRandomPower', 'winProbability'])
    } finally { compile.mockRestore() }
  })

  it('preserves each legacy default challenge value before and after the loss-band transition', () => {
    const rows = buildAttritionSeries(DEFAULT_SCENARIO.battle, {
      attackerIdolPower: 1, defenderIdolPower: 3, attackerInitialFans: 1000, defenderInitialFans: 1000, battles: 3,
    })
    const expected = [
      [1000, 3, 0.25, 0, 0.3, 240, 760],
      [760, 1.7328, 0.36592505854800933, 0, 0.3, 182, 578],
      [578, 1.002252, 0.4994376332249887, 0.48881653414311166, 0.2, 92, 486],
    ]
    rows.forEach((row, index) => {
      expect(row.attackerPrePower).toBe(1)
      const actual = [row.defenderFans, row.defenderPrePower, row.displayedTendency, row.actualWinProbability, row.lossRate, row.defenderLoss, row.defenderFansAfter]
      actual.forEach((value, column) => expect(value).toBeCloseTo(expected[index][column], 12))
    })
  })

  it('keeps cached evaluations sensitive to every power and probability input', () => {
    const config = { ...DEFAULT_SCENARIO.battle, alpha: 1, beta: 2, randomMin: 1, randomMax: 2, formulas: {
      ...DEFAULT_SCENARIO.battle.formulas,
      preRandomPower: 'idolPower + initialFans + currentFans + styleMultiplier + alpha + beta',
      winProbability: '(attackerPower + defenderPower + randomMin + randomMax) / 100',
    } }
    const runtime = createBattleRuntime(config)
    const input = { idolPower: 1, initialFans: 10, currentFans: 5, styleMultiplier: 1 }
    expect(runtime.preRandomPower(input)).toBe(20)
    for (const field of ['idolPower', 'initialFans', 'currentFans', 'styleMultiplier'] as const) {
      expect(runtime.preRandomPower({ ...input, [field]: input[field] + 1 })).toBe(21)
    }
    config.alpha = 2
    expect(runtime.preRandomPower(input)).toBe(21)
    config.beta = 3
    expect(runtime.preRandomPower(input)).toBe(22)
    expect(runtime.winProbability(1, 2)).toBe(0.06)
    expect(runtime.winProbability(2, 2)).toBe(0.07)
    expect(runtime.winProbability(1, 3)).toBe(0.07)
    config.randomMin = 2
    expect(runtime.winProbability(1, 2)).toBe(0.07)
    config.randomMax = 3
    expect(runtime.winProbability(1, 2)).toBe(0.08)
    // A separate runtime never reuses values calculated by another formula.
    const other = createBattleRuntime({ ...config, formulas: { ...config.formulas, preRandomPower: '99', winProbability: '0.9' } })
    expect(other.preRandomPower(input)).toBe(99)
    expect(other.winProbability(1, 2)).toBe(0.9)
  })

  it('retains the legacy analytic distribution in 50,000 fixed-seed Bernoulli battles per ratio', () => {
    const runtime = createBattleRuntime(DEFAULT_SCENARIO.battle)
    for (const [ratio, probability] of [[0.8, 0], [0.9, 0.1125], [1, 0.5], [1.1, 0.8625], [1.3, 1]]) {
      const rng = createSeededRng(20260928)
      let wins = 0
      for (let index = 0; index < 50_000; index++) {
        if (resolveBattle(DEFAULT_SCENARIO.battle, { ...combatant, idolPower: ratio }, combatant, rng, runtime).attackerWon) wins++
      }
      expect(Math.abs(wins / 50_000 - probability)).toBeLessThanOrEqual(Math.max(0.01, 4 * Math.sqrt(probability * (1 - probability) / 50_000)))
    }
  }, 30_000)
})

describe('battle engine', () => {
  it('keeps displayed tendency separate from actual probability', () => {
    const ratio = Math.pow(2, 1.36) / 3
    expect(displayTendency(ratio, 1)).toBeCloseTo(0.461096, 5)
    expect(uniformWinProbability(ratio, 1, 0.9, 1.1)).toBeCloseTo(0.0248, 3)
  })

  it('applies fan and style multipliers to pre-random power', () => {
    expect(calculateStyleMultiplier(-1, DEFAULT_SCENARIO.battle)).toBe(0.97)
    expect(calculateStyleMultiplier(0, DEFAULT_SCENARIO.battle)).toBe(1)
    expect(calculateStyleMultiplier(1, DEFAULT_SCENARIO.battle)).toBe(1.03)
    expect(calculatePreRandomPower({
      idolPower: 100_000,
      initialFans: 2000,
      currentFans: 1000,
      styleMultiplier: 1.03,
    }, DEFAULT_SCENARIO.battle)).toBeCloseTo(
      100_000 * Math.pow(2, 1.36) * Math.pow(0.5, 2) * 1.03,
      8,
    )
  })

  it('resolves every approved loss band at its lower boundary', () => {
    const config = DEFAULT_SCENARIO.battle
    expect(resolveLossRate(1.3, config)).toBe(0.1)
    expect(resolveLossRate(1.1, config)).toBe(0.1)
    expect(resolveLossRate(0.9, config)).toBe(0.2)
    expect(resolveLossRate(0.7, config)).toBe(0.1)
    expect(resolveLossRate(0.699, config)).toBe(0.3)
  })

  it('lets the defender keep ownership on an exact deterministic tie', () => {
    const outcome = resolveBattle(
      DEFAULT_SCENARIO.battle,
      { idolPower: 1, initialFans: 1000, currentFans: 1000, styleMultiplier: 1 },
      { idolPower: 1, initialFans: 1000, currentFans: 1000, styleMultiplier: 1 },
      { next: () => 0.5 },
    )
    expect(outcome.attackerWon).toBe(false)
    expect(outcome.attackerLoss).toBe(200)
    expect(outcome.defenderLoss).toBe(160)
    expect(outcome.attackerFansAfter).toBe(800)
    expect(outcome.defenderFansAfter).toBe(840)
  })

  it('puts equal-fan challengers near fifty percent on battle three', () => {
    const rows = buildAttritionSeries(DEFAULT_SCENARIO.battle, {
      attackerIdolPower: 1,
      defenderIdolPower: 3,
      attackerInitialFans: 1000,
      defenderInitialFans: 1000,
      battles: 3,
    })
    expect(rows.map((row) => Math.round(row.defenderFans))).toEqual([1000, 760, 578])
    expect(rows[0].actualWinProbability).toBe(0)
    expect(rows[1].actualWinProbability).toBe(0)
    expect(rows[2].actualWinProbability).toBeGreaterThanOrEqual(0.48)
    expect(rows[2].actualWinProbability).toBeLessThanOrEqual(0.52)
  })

  it('gives double-fan attackers a small first chance and suspense on battle two', () => {
    const rows = buildAttritionSeries(DEFAULT_SCENARIO.battle, {
      attackerIdolPower: 1,
      defenderIdolPower: 3,
      attackerInitialFans: 2000,
      defenderInitialFans: 1000,
      battles: 2,
    })
    expect(rows[0].actualWinProbability).toBeGreaterThanOrEqual(0.01)
    expect(rows[0].actualWinProbability).toBeLessThanOrEqual(0.04)
    expect(rows[1].actualWinProbability).toBeGreaterThanOrEqual(0.5)
    expect(rows[1].actualWinProbability).toBeLessThanOrEqual(0.6)
  })
})
