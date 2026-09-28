import type { Rng } from './rng'
import type { BattleConfig } from './types'

export interface CombatantInput {
  idolPower: number
  initialFans: number
  currentFans: number
  styleMultiplier: number
}

export interface BattleOutcome {
  attackerWon: boolean
  attackerPrePower: number
  defenderPrePower: number
  displayedTendency: number
  actualWinProbability: number
  attackerLoss: number
  defenderLoss: number
  attackerFansAfter: number
  defenderFansAfter: number
}

export interface AttritionSeriesInput {
  attackerIdolPower: number
  defenderIdolPower: number
  attackerInitialFans: number
  defenderInitialFans: number
  battles: number
  attackerStyleMultiplier?: number
  defenderStyleMultiplier?: number
}

export interface AttritionPoint {
  battle: number
  attackerFans: number
  defenderFans: number
  attackerPrePower: number
  defenderPrePower: number
  displayedTendency: number
  actualWinProbability: number
  lossRate: number
  defenderLoss: number
  defenderFansAfter: number
}

export function calculateStyleMultiplier(
  relation: -1 | 0 | 1,
  config: BattleConfig,
): number {
  return 1 + relation * config.styleAdvantage
}

export function calculatePreRandomPower(
  combatant: CombatantInput,
  config: BattleConfig,
): number {
  if (
    combatant.idolPower <= 0
    || combatant.initialFans <= 0
    || combatant.currentFans <= 0
    || combatant.styleMultiplier <= 0
  ) {
    return 0
  }

  return combatant.idolPower
    * Math.pow(combatant.initialFans / 1000, config.alpha)
    * Math.pow(combatant.currentFans / combatant.initialFans, config.beta)
    * combatant.styleMultiplier
}

export function displayTendency(attackerPower: number, defenderPower: number): number {
  const total = attackerPower + defenderPower
  return total > 0 ? attackerPower / total : 0.5
}

export function uniformWinProbability(
  attackerPower: number,
  defenderPower: number,
  minRoll: number,
  maxRoll: number,
): number {
  if (defenderPower <= 0) return attackerPower > 0 ? 1 : 0
  const ratio = attackerPower / defenderPower
  if (!(ratio > 0) || !(maxRoll > minRoll)) return 0
  const width = maxRoll - minRoll
  const linearLo = Math.max(minRoll, minRoll / ratio)
  const linearHi = Math.min(maxRoll, maxRoll / ratio)
  const linearArea = linearHi > linearLo
    ? (
        0.5 * ratio * (linearHi ** 2 - linearLo ** 2)
        - minRoll * (linearHi - linearLo)
      ) / width
    : 0
  const fullArea = Math.max(0, maxRoll - Math.max(minRoll, maxRoll / ratio))
  return Math.min(1, Math.max(0, (linearArea + fullArea) / width))
}

export function resolveLossRate(ratio: number, config: BattleConfig): number {
  return config.lossBands.find((band) => ratio >= band.minRatio)?.rate
    ?? config.lossBands.at(-1)?.rate
    ?? 0
}

function clampedLoss(fans: number, rate: number): number {
  return Math.min(Math.max(0, Math.round(fans * rate)), Math.max(0, fans))
}

export function resolveBattle(
  config: BattleConfig,
  attacker: CombatantInput,
  defender: CombatantInput,
  rng: Rng,
): BattleOutcome {
  const attackerPrePower = calculatePreRandomPower(attacker, config)
  const defenderPrePower = calculatePreRandomPower(defender, config)
  const width = config.randomMax - config.randomMin
  const attackerRoll = config.randomMin + rng.next() * width
  const defenderRoll = config.randomMin + rng.next() * width
  const attackerWon = attackerPrePower * attackerRoll > defenderPrePower * defenderRoll
  const ratio = defenderPrePower > 0
    ? attackerPrePower / defenderPrePower
    : attackerPrePower > 0 ? Number.POSITIVE_INFINITY : 0
  const lossRate = resolveLossRate(ratio, config)
  const attackerLoss = clampedLoss(attacker.currentFans, lossRate)
  const defenderLoss = clampedLoss(
    defender.currentFans,
    lossRate * config.homeLossFactor,
  )

  return {
    attackerWon,
    attackerPrePower,
    defenderPrePower,
    displayedTendency: displayTendency(attackerPrePower, defenderPrePower),
    actualWinProbability: uniformWinProbability(
      attackerPrePower,
      defenderPrePower,
      config.randomMin,
      config.randomMax,
    ),
    attackerLoss,
    defenderLoss,
    attackerFansAfter: Math.max(0, attacker.currentFans - attackerLoss),
    defenderFansAfter: Math.max(0, defender.currentFans - defenderLoss),
  }
}

export function buildAttritionSeries(
  config: BattleConfig,
  input: AttritionSeriesInput,
): AttritionPoint[] {
  const rows: AttritionPoint[] = []
  let defenderFans = Math.max(0, Math.round(input.defenderInitialFans))

  for (let battle = 1; battle <= input.battles; battle += 1) {
    const attacker: CombatantInput = {
      idolPower: input.attackerIdolPower,
      initialFans: input.attackerInitialFans,
      currentFans: input.attackerInitialFans,
      styleMultiplier: input.attackerStyleMultiplier ?? 1,
    }
    const defender: CombatantInput = {
      idolPower: input.defenderIdolPower,
      initialFans: input.defenderInitialFans,
      currentFans: defenderFans,
      styleMultiplier: input.defenderStyleMultiplier ?? 1,
    }
    const attackerPrePower = calculatePreRandomPower(attacker, config)
    const defenderPrePower = calculatePreRandomPower(defender, config)
    const ratio = defenderPrePower > 0
      ? attackerPrePower / defenderPrePower
      : Number.POSITIVE_INFINITY
    const lossRate = resolveLossRate(ratio, config)
    const defenderLoss = clampedLoss(
      defenderFans,
      lossRate * config.homeLossFactor,
    )
    const defenderFansAfter = Math.max(0, defenderFans - defenderLoss)

    rows.push({
      battle,
      attackerFans: input.attackerInitialFans,
      defenderFans,
      attackerPrePower,
      defenderPrePower,
      displayedTendency: displayTendency(attackerPrePower, defenderPrePower),
      actualWinProbability: uniformWinProbability(
        attackerPrePower,
        defenderPrePower,
        config.randomMin,
        config.randomMax,
      ),
      lossRate,
      defenderLoss,
      defenderFansAfter,
    })

    defenderFans = defenderFansAfter
  }

  return rows
}
