import { buildAttritionSeries } from './battle'
import type { MonteCarloResult } from './aggregate'
import type { NodeKind, Scenario, Tier } from './types'
import { runTrials, type TrialHooks } from '../worker/runner'

export type SensitivityParameter =
  | 'battle.alpha'
  | 'battle.beta'
  | 'battle.closeLossRate'
  | 'score.coreMultiplier'
  | 'score.centerMultiplier'
  | 'supply.dailyUsdBudget'

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
  finalScore: number
  firstPlaceProbability: number
  nodeCounts: Record<NodeKind, number>
  usd: number
  diamonds: number
  ads: number
  acceptedFans: number
  wastedFans: number
}

export interface SensitivityResult {
  request: SensitivityRequest
  points: SensitivityPoint[]
  cancelled: boolean
}

export interface SensitivityHooks extends TrialHooks {
  onPointProgress?: (completed: number, total: number) => void
}

function parameterValues(min: number, max: number, step: number): number[] {
  if (!(step > 0) || max < min) throw new Error('Sensitivity range must use a positive step')
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
    scenario.supply.purchasePolicies[tier].dailyUsdBudget = value
  }
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
    attackerIdolPower: 1,
    defenderIdolPower: 3,
    attackerInitialFans: 1000,
    defenderInitialFans: 1000,
    battles: 3,
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
    finalScore,
    firstPlaceProbability,
    nodeCounts,
    usd: target.spend.usd.mean,
    diamonds: target.spend.diamonds.mean,
    ads: target.spend.ads.mean,
    acceptedFans,
    wastedFans,
  }
}

export async function runSensitivity(
  scenario: Scenario,
  request: SensitivityRequest,
  hooks: SensitivityHooks = {},
): Promise<SensitivityResult> {
  const values = parameterValues(request.min, request.max, request.step)
  const points: SensitivityPoint[] = []
  const tier = request.targetTier ?? 'whale'
  let cancelled = false

  for (let index = 0; index < values.length; index += 1) {
    if (hooks.isCancelled?.()) {
      cancelled = true
      break
    }
    const variant = structuredClone(scenario)
    applyParameter(variant, request.parameter, values[index], tier)
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

  if (request.metric === 'incrementalScorePerUsd') {
    const baselineScore = points[0]?.finalScore ?? 0
    for (const point of points) {
      point.metricValue = point.usd > 0
        ? (point.finalScore - baselineScore) / point.usd
        : 0
    }
  }

  return { request, points, cancelled }
}

export function deriveSpendThresholds(points: SensitivityPoint[]): {
  dailyBudget50: number | null
  dailyBudget80: number | null
} {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  return {
    dailyBudget50: sorted.find((point) => point.firstPlaceProbability >= 0.5)?.x ?? null,
    dailyBudget80: sorted.find((point) => point.firstPlaceProbability >= 0.8)?.x ?? null,
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
