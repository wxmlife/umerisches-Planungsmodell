import { buildAttritionSeries, createBattleRuntime, type AttritionPoint } from '../domain/battle'
import { compileFormula } from '../domain/formula/compiler'
import { normalizeFormulaError, type FormulaId, type FormulaErrorDto } from '../domain/formula/types'
import { createSeededRng } from '../domain/rng'
import { runSeason } from '../domain/season'
import type { Scenario } from '../domain/types'
import { validateScenario } from '../domain/validation'

export interface CalibrationResult { equalFans: AttritionPoint[]; doubleFans: AttritionPoint[] }

export function validateDraftScenario(scenario: Scenario) {
  const validation = validateScenario(scenario)
  const formulaErrors: Partial<Record<FormulaId, FormulaErrorDto>> = {}
  for (const formulaId of Object.keys(scenario.battle.formulas) as FormulaId[]) {
    try { compileFormula(formulaId, scenario.battle.formulas[formulaId]) } catch (error) {
      const formula = normalizeFormulaError(error, 'draft-validation')
      if (formula) formulaErrors[formulaId] = formula
      validation.issues.push({ path: `battle.formulas.${formulaId}`, message: formula?.message ?? '公式校验失败。' })
    }
  }
  return { validation: { valid: validation.issues.length === 0, issues: validation.issues }, formulaErrors }
}

export function buildCalibration(scenario: Scenario): CalibrationResult {
  const { battle } = scenario
  const runtime = createBattleRuntime(battle, 'deterministic')
  const relation = battle.calibrationStyle === 'attacker-advantage' ? 1 : battle.calibrationStyle === 'attacker-disadvantage' ? -1 : 0
  const input = {
    attackerIdolPower: battle.baseIdolPower * battle.tierMultipliers.small,
    defenderIdolPower: battle.baseIdolPower * battle.tierMultipliers.whale,
    attackerInitialFans: 1000, defenderInitialFans: 1000, battles: 6,
    attackerStyleMultiplier: 1 + relation * battle.styleAdvantage,
    defenderStyleMultiplier: 1 - relation * battle.styleAdvantage,
  }
  return {
    equalFans: buildAttritionSeries(battle, input, runtime),
    doubleFans: buildAttritionSeries(battle, { ...input, attackerInitialFans: 2000 }, runtime),
  }
}

// A candidate becomes usable only when both complete result sets have succeeded.
export function runDeterministicScenario(scenario: Scenario) {
  const calibration = buildCalibration(scenario)
  const deterministic = runSeason(scenario, createSeededRng(scenario.simulation.seed), 'deterministic')
  if (deterministic.termination !== 'season-end') throw new Error('Incomplete deterministic season')
  return { deterministic, calibration }
}
