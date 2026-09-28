import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import {
  buildAttritionSeries,
  calculatePreRandomPower,
  calculateStyleMultiplier,
  displayTendency,
  resolveBattle,
  resolveLossRate,
  uniformWinProbability,
} from '../battle'

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
