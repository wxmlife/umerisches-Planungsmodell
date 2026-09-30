import { uniformWinProbability } from './battle'
import type { Rng } from './rng'
import { createSeededRng } from './rng'

export type IdolMatchup = '攻方克制' | '无克制' | '守方克制'

export interface BattleDetailInput {
  attackerIdolPower: number
  defenderIdolPower: number
  attackerInitialFans: number
  defenderInitialFans: number
  rounds?: number
  seed?: number
}

export interface BattleDetailRow {
  round: number
  attackerFans: number
  attackerLoss: number
  defenderFans: number
  defenderLoss: number
  attackerPower: number
  defenderPower: number
  attackerFinalPower: number
  defenderFinalPower: number
  displayedTendency: number
  actualWinProbability: number
  attackerWon: boolean
  idolRolls: number[]
  idolMatchups: IdolMatchup[]
}

const idolExponent = 0.6
const fanExponent = 1
const referenceIdolPower = 100_000
const fanBase = 1_000
const counterMultiplier = 1.15
const baseLossRate = 0.065
const lossWeight = 0.11
const lossCap = 0.35
const matchupWeights = [0.2, 0.2, 0.2, 0.2, 0.2]

function idolPower(power: number, fans: number): number {
  if (power <= 0 || fans <= 0) return 0
  return referenceIdolPower * Math.pow(power / referenceIdolPower, idolExponent) * Math.pow(fans / fanBase, fanExponent)
}

function ratioBand(ratio: number): number {
  if (ratio < 0.7) return 0.3
  if (ratio < 0.9) return 0.2
  if (ratio < 1.1) return 0.1
  if (ratio < 1.3) return 0.05
  return 0.03
}

function loss(fans: number, ratio: number): number {
  return Math.min(fans, Math.round(fans * Math.min(lossCap, baseLossRate + ratioBand(ratio) * lossWeight)))
}

function matchup(roll: number): IdolMatchup {
  if (roll < 1 / 3) return '攻方克制'
  if (roll < 2 / 3) return '无克制'
  return '守方克制'
}

function composite(base: number, matchups: IdolMatchup[], side: 'attacker' | 'defender'): number {
  const multiplier = matchups.reduce((sum, status, index) => {
    const countered = side === 'attacker' ? status === '攻方克制' : status === '守方克制'
    return sum + matchupWeights[index] * (countered ? counterMultiplier : 1)
  }, 0)
  return base * multiplier
}

export function buildBattleDetail(input: BattleDetailInput, rng: Rng = createSeededRng(input.seed ?? 20260930)): BattleDetailRow[] {
  const rows: BattleDetailRow[] = []
  const rounds = Math.max(1, Math.round(input.rounds ?? 5))
  let attackerFans = Math.max(0, Math.round(input.attackerInitialFans))
  let defenderFans = Math.max(0, Math.round(input.defenderInitialFans))

  for (let round = 1; round <= rounds; round += 1) {
    const rolls = Array.from({ length: 5 }, () => rng.next())
    const matchups = rolls.map(matchup)
    const attackerPower = idolPower(input.attackerIdolPower / 5, attackerFans)
    const defenderPower = idolPower(input.defenderIdolPower / 5, defenderFans)
    const effectiveAttacker = composite(attackerPower, matchups, 'attacker')
    const effectiveDefender = composite(defenderPower, matchups, 'defender')
    const probability = uniformWinProbability(effectiveAttacker, effectiveDefender, 0.9, 1.1)
    const attackerRoll = rng.next()
    const attackerWon = attackerRoll < probability
    const attackerRatio = effectiveDefender > 0 ? effectiveAttacker / effectiveDefender : 1e15
    const defenderRatio = effectiveAttacker > 0 ? effectiveDefender / effectiveAttacker : 1e15
    const attackerLoss = loss(attackerFans, attackerRatio)
    const defenderLoss = loss(defenderFans, defenderRatio)
    rows.push({
      round, attackerFans, attackerLoss, defenderFans, defenderLoss,
      attackerPower: effectiveAttacker, defenderPower: effectiveDefender,
      attackerFinalPower: effectiveAttacker * (0.9 + rng.next() * 0.2),
      defenderFinalPower: effectiveDefender * (0.9 + rng.next() * 0.2),
      displayedTendency: effectiveAttacker + effectiveDefender > 0 ? effectiveAttacker / (effectiveAttacker + effectiveDefender) : 0.5,
      actualWinProbability: probability, attackerWon, idolRolls: rolls, idolMatchups: matchups,
    })
    attackerFans = Math.max(0, attackerFans - attackerLoss)
    defenderFans = Math.max(0, defenderFans - defenderLoss)
  }
  return rows
}

