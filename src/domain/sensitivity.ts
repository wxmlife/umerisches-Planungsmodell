import { buildAttritionSeries } from './battle'
import type { MonteCarloResult } from './aggregate'
import type {
  NodeKind,
  Scenario,
  Tier,
  ValidationIssue,
  ValidationResult,
} from './types'
import { validateScenario } from './validation'
import { runTrials, type TrialHooks } from '../worker/runner'

export type SensitivityParameter =
  | 'battle.alpha'
  | 'battle.beta'
  | 'battle.closeLossRate'
  | 'score.coreMultiplier'
  | 'score.centerMultiplier'
  | 'supply.versionUsdBudget'

export type SensitivityMetric =
  | 'battleThreeWinProbability'
  | 'finalScoreGap'
  | 'firstPlaceProbability'
  | 'finalNodeCount'
  | 'incrementalScorePerUsd'

export interface SensitivityRequest {
  parameter: SensitivityParameter
  metric: SensitivityMetric
  min: number
  max: number
  step: number
  targetGuildId: string
  targetTier?: Tier
  runs: number
  seed: number
}

export interface SensitivityPoint {
  x: number
  metricValue: number
  incrementalScorePerUsd: number
  finalScore: number
  firstPlaceProbability: number
  nodeCounts: Record<NodeKind, number>
  usd: number
  diamonds: number
  ads: number
  acceptedFans: number
  wastedFans: number
  actionCapacityBound: boolean
}

export interface SensitivityResult {
  request: SensitivityRequest
  points: SensitivityPoint[]
  cancelled: boolean
}

export interface SensitivityHooks extends TrialHooks {
  onPointProgress?: (completed: number, total: number) => void
}

const MAX_SENSITIVITY_POINTS = 201

function parameterValues(min: number, max: number, step: number): number[] {
  if (![min, max, step].every(Number.isFinite)) {
    throw new Error('敏感性扫描范围必须是有限数值')
  }
  if (!(step > 0)) throw new Error('敏感性扫描步长必须大于 0')
  if (max < min) throw new Error('扫描最大值不能小于最小值')
  const pointCount = Math.floor((max - min) / step + 1e-9) + 1
  if (pointCount > MAX_SENSITIVITY_POINTS) {
    throw new Error(`敏感性扫描最多支持 ${MAX_SENSITIVITY_POINTS} 个点`)
  }
  const values: number[] = []
  for (let value = min; value <= max + step * 1e-9; value += step) {
    values.push(Number(value.toFixed(12)))
  }
  return values
}

function applyParameter(
  scenario: Scenario,
  parameter: SensitivityParameter,
  value: number,
  tier: Tier,
  guildId: string,
) {
  if (parameter === 'battle.alpha') scenario.battle.alpha = value
  else if (parameter === 'battle.beta') scenario.battle.beta = value
  else if (parameter === 'battle.closeLossRate') {
    const closeLoss = scenario.battle.lossBands.find((band) => band.minRatio === 0.7)
    if (!closeLoss) throw new Error('Close-loss band is missing')
    closeLoss.rate = value
  } else if (parameter === 'score.coreMultiplier') {
    scenario.score.nodeMultipliers.core = value
  } else if (parameter === 'score.centerMultiplier') {
    scenario.score.nodeMultipliers.center = value
  } else {
    const guild = scenario.guilds.find((candidate) => candidate.id === guildId)
    if (!guild) throw new Error(`Unknown target guild: ${guildId}`)
    guild.purchasePolicies[tier].versionUsdBudget = value
  }
}

export function validateSensitivityRequest(
  scenario: Scenario,
  request: Pick<
    SensitivityRequest,
    'parameter' | 'min' | 'max' | 'step' | 'targetGuildId' | 'targetTier'
  >,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let values: number[] = []
  try {
    values = parameterValues(request.min, request.max, request.step)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const path = message.includes('步长') || message.includes('个点')
      ? 'analysis.sweepStep'
      : 'analysis.sweepMin'
    issues.push({ path, message })
  }
  if (!scenario.guilds.some((guild) => guild.id === request.targetGuildId)) {
    issues.push({ path: 'analysis.targetGuildId', message: '目标公会不存在' })
  }
  if (issues.length > 0) return { valid: false, issues }

  const tier = request.targetTier ?? 'whale'
  for (const value of values) {
    const variant = structuredClone(scenario)
    applyParameter(variant, request.parameter, value, tier, request.targetGuildId)
    const validation = validateScenario(variant)
    if (!validation.valid) {
      issues.push({
        path: 'analysis.sweepMin',
        message: `扫描值 ${value} 无效：${validation.issues[0].message}`,
      })
      break
    }
  }
  return { valid: issues.length === 0, issues }
}

function lastMean(
  series: Array<{ mean: number }>,
): number {
  return series.at(-1)?.mean ?? 0
}

function buildPoint(
  x: number,
  request: SensitivityRequest,
  scenario: Scenario,
  monteCarlo: MonteCarloResult,
): SensitivityPoint {
  const target = monteCarlo.guilds[request.targetGuildId]
  if (!target) throw new Error(`Unknown target guild: ${request.targetGuildId}`)
  const finalScore = target.finalScore.mean
  const firstPlaceProbability = target.rankProbabilities[1] ?? 0
  const nodeCounts = {
    normal: lastMean(target.nodeSeries.normal),
    core: lastMean(target.nodeSeries.core),
    center: lastMean(target.nodeSeries.center),
  }
  const acceptedFans = Object.values(target.supplyBySource).reduce(
    (sum, source) => sum + source.acceptedFans.mean,
    0,
  )
  const wastedFans = Object.values(target.supplyBySource).reduce(
    (sum, source) => sum + source.wastedFans.mean,
    0,
  )
  const competitors = Object.entries(monteCarlo.guilds)
    .filter(([guildId]) => guildId !== request.targetGuildId)
    .map(([, guild]) => guild.finalScore.mean)
  const battleThreeWinProbability = buildAttritionSeries(scenario.battle, {
    attackerIdolPower: scenario.battle.baseIdolPower
      * scenario.battle.tierMultipliers.small,
    defenderIdolPower: scenario.battle.baseIdolPower
      * scenario.battle.tierMultipliers.whale,
    attackerInitialFans: 1000,
    defenderInitialFans: 1000,
    battles: 3,
    attackerStyleMultiplier: scenario.battle.calibrationStyle === 'attacker-advantage'
      ? 1 + scenario.battle.styleAdvantage
      : scenario.battle.calibrationStyle === 'attacker-disadvantage'
        ? 1 - scenario.battle.styleAdvantage
        : 1,
    defenderStyleMultiplier: scenario.battle.calibrationStyle === 'attacker-advantage'
      ? 1 - scenario.battle.styleAdvantage
      : scenario.battle.calibrationStyle === 'attacker-disadvantage'
        ? 1 + scenario.battle.styleAdvantage
        : 1,
  }).at(-1)?.actualWinProbability ?? 0
  const metricValue = request.metric === 'battleThreeWinProbability'
    ? battleThreeWinProbability
    : request.metric === 'finalScoreGap'
      ? finalScore - Math.max(0, ...competitors)
      : request.metric === 'firstPlaceProbability'
        ? firstPlaceProbability
        : request.metric === 'finalNodeCount'
          ? nodeCounts.normal + nodeCounts.core + nodeCounts.center
          : 0

  return {
    x,
    metricValue,
    incrementalScorePerUsd: 0,
    finalScore,
    firstPlaceProbability,
    nodeCounts,
    usd: target.spend.usd.mean,
    diamonds: target.spend.diamonds.mean,
    ads: target.spend.ads.mean,
    acceptedFans,
    wastedFans,
    actionCapacityBound: (
      target.actionCapacityBlocks.formation.mean
      + target.actionCapacityBlocks.cooldown.mean
    ) > 0,
  }
}

export async function runSensitivity(
  scenario: Scenario,
  request: SensitivityRequest,
  hooks: SensitivityHooks = {},
): Promise<SensitivityResult> {
  const validation = validateSensitivityRequest(scenario, request)
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join('；'))
  }
  const values = parameterValues(request.min, request.max, request.step)
  const points: SensitivityPoint[] = []
  const tier = request.targetTier ?? 'whale'
  let cancelled = false
  let zeroBudgetControl: SensitivityPoint | null = null

  if (request.parameter === 'supply.versionUsdBudget' && !values.includes(0)) {
    const baseline = structuredClone(scenario)
    applyParameter(baseline, request.parameter, 0, tier, request.targetGuildId)
    const result = await runTrials(
      { scenario: baseline, runs: request.runs, seed: request.seed },
      { isCancelled: hooks.isCancelled },
    )
    if (result.cancelled) return { request, points, cancelled: true }
    zeroBudgetControl = buildPoint(0, request, baseline, result)
  }

  for (let index = 0; index < values.length; index += 1) {
    if (hooks.isCancelled?.()) {
      cancelled = true
      break
    }
    const variant = structuredClone(scenario)
    applyParameter(variant, request.parameter, values[index], tier, request.targetGuildId)
    const result = await runTrials(
      { scenario: variant, runs: request.runs, seed: request.seed + index },
      { isCancelled: hooks.isCancelled, onProgress: hooks.onProgress },
    )
    if (result.cancelled) {
      cancelled = true
      break
    }
    points.push(buildPoint(values[index], request, variant, result))
    hooks.onPointProgress?.(index + 1, values.length)
    if ((index + 1) % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const baseline = zeroBudgetControl
    ?? points.find((point) => point.x === 0)
    ?? points[0]
  if (baseline) {
    for (const point of points) {
      const incrementalUsd = point.usd - baseline.usd
      point.incrementalScorePerUsd = incrementalUsd > 0
        ? (point.finalScore - baseline.finalScore) / incrementalUsd
        : 0
      if (request.metric === 'incrementalScorePerUsd') {
        point.metricValue = point.incrementalScorePerUsd
      }
    }
  }

  return { request, points, cancelled }
}

export function deriveSpendThresholds(points: SensitivityPoint[]): {
  versionBudget50: number | null
  versionBudget80: number | null
} {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  return {
    versionBudget50: sorted.find((point) => point.firstPlaceProbability >= 0.5)?.x ?? null,
    versionBudget80: sorted.find((point) => point.firstPlaceProbability >= 0.8)?.x ?? null,
  }
}

export function deriveNodeTargetThreshold(
  points: SensitivityPoint[],
  target: Record<NodeKind, number>,
): number | null {
  return [...points]
    .sort((a, b) => a.x - b.x)
    .find((point) => (
      point.nodeCounts.normal >= target.normal
      && point.nodeCounts.core >= target.core
      && point.nodeCounts.center >= target.center
    ))?.x ?? null
}
