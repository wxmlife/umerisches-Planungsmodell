import type { Rng } from './rng'
import type { BattleConfig } from './types'
import { DEFAULT_BATTLE_FORMULAS } from './defaults'
import { compileFormula } from './formula/compiler'
import { evaluateFormula } from './formula/runtime'
import { normalizeFormulaError } from './formula/types'
import type { FormulaErrorContext } from './formula/types'

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

export function createBattleRuntime(
  config: BattleConfig,
  context: FormulaErrorContext = 'deterministic',
) {
  try {
    const power = compileFormula('preRandomPower', config.formulas.preRandomPower)
    const tendency = compileFormula('displayedTendency', config.formulas.displayedTendency)
    const probability = compileFormula('winProbability', config.formulas.winProbability)
    const loss = compileFormula('fanLoss', config.formulas.fanLoss)
    const powerCache = new Map<string, number>()
    // Two numeric lookup levels avoid constructing a string for every target.
    // At most 16 attacker powers × 64 defender powers = 1,024 entries.
    const probabilityCache = new Map<number, Map<number, number>>()
    let cachedRandomMin = config.randomMin
    let cachedRandomMax = config.randomMax
    // Target evaluation repeatedly visits unchanged combatants. Cache only
    // successful pure evaluations, bounded independently for this runtime.
    const memo = (cache: Map<string, number>, key: string, evaluate: () => number): number => {
      const cached = cache.get(key)
      if (cached !== undefined) return cached
      const result = evaluate()
      cache.set(key, result)
      if (cache.size > 1024) cache.delete(cache.keys().next().value!)
      return result
    }
    return {
      preRandomPower(combatant: CombatantInput): number {
        if (combatant.idolPower <= 0 || combatant.initialFans <= 0 || combatant.currentFans <= 0 || combatant.styleMultiplier <= 0) return 0
        const key = [combatant.idolPower, combatant.initialFans, combatant.currentFans, combatant.styleMultiplier, config.alpha, config.beta].join(':')
        return memo(powerCache, key, () => evaluateFormula(power, { ...combatant, alpha: config.alpha, beta: config.beta }, context))
      },
      displayedTendency(attackerPower: number, defenderPower: number): number {
        return evaluateFormula(tendency, { attackerPower, defenderPower }, context)
      },
      winProbability(attackerPower: number, defenderPower: number): number {
        if (cachedRandomMin !== config.randomMin || cachedRandomMax !== config.randomMax) {
          probabilityCache.clear()
          cachedRandomMin = config.randomMin
          cachedRandomMax = config.randomMax
        }
        let defenderPowers = probabilityCache.get(attackerPower)
        const cached = defenderPowers?.get(defenderPower)
        if (cached !== undefined) return cached
        const result = evaluateFormula(probability, { attackerPower, defenderPower, randomMin: config.randomMin, randomMax: config.randomMax }, context)
        if (!defenderPowers) {
          defenderPowers = new Map()
          probabilityCache.set(attackerPower, defenderPowers)
          if (probabilityCache.size > 16) probabilityCache.delete(probabilityCache.keys().next().value!)
        }
        defenderPowers.set(defenderPower, result)
        if (defenderPowers.size > 64) defenderPowers.delete(defenderPowers.keys().next().value!)
        return result
      },
      fanLoss(currentFans: number, attackerToDefenderPowerRatio: number, lossBandRate: number, attackerWon: boolean, isDefender: boolean): number {
        if (currentFans <= 0) return 0
        const rawLoss = evaluateFormula(loss, {
          currentFans, attackerToDefenderPowerRatio, lossBandRate,
          sideLossFactor: isDefender ? config.homeLossFactor : 1, attackerWon, isDefender,
        }, context)
        return Math.min(currentFans, Math.round(rawLoss))
      },
    }
  } catch (error) {
    throw normalizeFormulaError(error, context) ?? error
  }
}

export type BattleRuntime = ReturnType<typeof createBattleRuntime>

// Compatibility helpers use the same evaluator. Simulation paths create one
// runtime up front and reuse it instead of compiling at each call site.
export function calculatePreRandomPower(combatant: CombatantInput, config: BattleConfig): number {
  return createBattleRuntime(config).preRandomPower(combatant)
}

export function displayTendency(attackerPower: number, defenderPower: number): number {
  return evaluateFormula(compileFormula('displayedTendency', DEFAULT_BATTLE_FORMULAS.displayedTendency), { attackerPower, defenderPower })
}

export function uniformWinProbability(
  attackerPower: number,
  defenderPower: number,
  minRoll: number,
  maxRoll: number,
): number {
  return evaluateFormula(compileFormula('winProbability', DEFAULT_BATTLE_FORMULAS.winProbability), { attackerPower, defenderPower, randomMin: minRoll, randomMax: maxRoll })
}

export function resolveLossRate(ratio: number, config: BattleConfig): number {
  return config.lossBands.find((band) => ratio >= band.minRatio)?.rate
    ?? config.lossBands.at(-1)?.rate
    ?? 0
}

function powerRatio(attackerPower: number, defenderPower: number): number {
  if (defenderPower === 0) return attackerPower > 0 ? 1e15 : 0
  return Math.min(1e15, attackerPower / defenderPower)
}

export function resolveBattle(
  config: BattleConfig,
  attacker: CombatantInput,
  defender: CombatantInput,
  rng: Rng,
  runtime: BattleRuntime = createBattleRuntime(config),
): BattleOutcome {
  const attackerPrePower = runtime.preRandomPower(attacker)
  const defenderPrePower = runtime.preRandomPower(defender)
  const actualWinProbability = runtime.winProbability(attackerPrePower, defenderPrePower)
  const attackerWon = rng.next() < actualWinProbability
  const ratio = powerRatio(attackerPrePower, defenderPrePower)
  const lossRate = resolveLossRate(ratio, config)
  const attackerLoss = runtime.fanLoss(attacker.currentFans, ratio, lossRate, attackerWon, false)
  const defenderLoss = runtime.fanLoss(defender.currentFans, ratio, lossRate, attackerWon, true)

  return {
    attackerWon,
    attackerPrePower,
    defenderPrePower,
    displayedTendency: runtime.displayedTendency(attackerPrePower, defenderPrePower),
    actualWinProbability,
    attackerLoss,
    defenderLoss,
    attackerFansAfter: Math.max(0, attacker.currentFans - attackerLoss),
    defenderFansAfter: Math.max(0, defender.currentFans - defenderLoss),
  }
}

export function buildAttritionSeries(
  config: BattleConfig,
  input: AttritionSeriesInput,
  runtime: BattleRuntime = createBattleRuntime(config),
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
    const attackerPrePower = runtime.preRandomPower(attacker)
    const defenderPrePower = runtime.preRandomPower(defender)
    const actualWinProbability = runtime.winProbability(attackerPrePower, defenderPrePower)
    const ratio = powerRatio(attackerPrePower, defenderPrePower)
    const lossRate = resolveLossRate(ratio, config)
    const lossWin = runtime.fanLoss(defenderFans, ratio, lossRate, true, true)
    const lossLose = runtime.fanLoss(defenderFans, ratio, lossRate, false, true)
    const defenderLoss = Math.min(defenderFans, Math.round(actualWinProbability * lossWin + (1 - actualWinProbability) * lossLose))
    const defenderFansAfter = Math.max(0, defenderFans - defenderLoss)

    rows.push({
      battle,
      attackerFans: input.attackerInitialFans,
      defenderFans,
      attackerPrePower,
      defenderPrePower,
      displayedTendency: runtime.displayedTendency(attackerPrePower, defenderPrePower),
      actualWinProbability,
      lossRate,
      defenderLoss,
      defenderFansAfter,
    })

    defenderFans = defenderFansAfter
  }

  return rows
}
