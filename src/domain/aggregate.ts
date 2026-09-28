import type { NodeKind } from './types'
import type { SeasonResult, SeasonSnapshot } from './season'
import type { RewardDistribution } from './rewards'
export { aggregateRewardModels } from './rewards'

export interface Quantiles {
  p10: number
  median: number
  p90: number
  mean: number
}

export interface QuantilePoint extends Quantiles {
  minute: number
}

export interface GuildMonteCarloResult {
  scoreSeries: QuantilePoint[]
  attackScoreSeries: QuantilePoint[]
  holdingScoreSeries: QuantilePoint[]
  nodeSeries: Record<NodeKind, QuantilePoint[]>
  availableFanSeries: QuantilePoint[]
  garrisonFanSeries: QuantilePoint[]
  lostFanSeries: QuantilePoint[]
  finalScore: Quantiles
  rankProbabilities: Record<number, number>
  actionCapacityBlocks: { formation: Quantiles; cooldown: Quantiles }
  spend: { usd: Quantiles; diamonds: Quantiles; ads: Quantiles }
  supplyBySource: Record<
    string,
    { theoreticalFans: Quantiles; acceptedFans: Quantiles; wastedFans: Quantiles }
  >
}

export interface MonteCarloResult {
  guilds: Record<string, GuildMonteCarloResult>
  runsRequested: number
  runsCompleted: number
  cancelled: boolean
  rewards?: RewardDistribution
}

function percentile(sorted: number[], probability: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const fraction = position - lower
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction
}

export function quantiles(values: number[]): Quantiles {
  if (values.length === 0) return { p10: 0, median: 0, p90: 0, mean: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

function snapshotMaps(
  results: SeasonResult[],
  guildId: string,
): Array<Map<number, SeasonSnapshot>> {
  return results.map((result) => new Map(
    result.snapshots
      .filter((snapshot) => snapshot.guildId === guildId)
      .map((snapshot) => [snapshot.minute, snapshot]),
  ))
}

function buildSeries(
  maps: Array<Map<number, SeasonSnapshot>>,
  minutes: number[],
  select: (snapshot: SeasonSnapshot) => number,
): QuantilePoint[] {
  return minutes.map((minute) => ({
    minute,
    ...quantiles(maps.map((map) => {
      const snapshot = map.get(minute)
      if (!snapshot) throw new Error(`Missing fixed-grid snapshot at minute ${minute}`)
      return select(snapshot)
    })),
  }))
}

function calculateRanks(
  results: SeasonResult[],
  guildIds: string[],
): Record<string, Record<number, number>> {
  const ranks = Object.fromEntries(guildIds.map((guildId) => [guildId, {}])) as Record<
    string,
    Record<number, number>
  >
  for (const guildId of guildIds) {
    for (let rank = 1; rank <= guildIds.length; rank += 1) ranks[guildId][rank] = 0
  }

  for (const result of results) {
    const sorted = guildIds
      .map((guildId) => ({ guildId, score: result.guilds[guildId]?.totalScore ?? 0 }))
      .sort((a, b) => b.score - a.score)
    let start = 0
    while (start < sorted.length) {
      let end = start + 1
      while (
        end < sorted.length
        && Math.abs(sorted[end].score - sorted[start].score) <= 1e-9
      ) {
        end += 1
      }
      const groupSize = end - start
      for (let member = start; member < end; member += 1) {
        for (let rankIndex = start; rankIndex < end; rankIndex += 1) {
          ranks[sorted[member].guildId][rankIndex + 1] += 1 / groupSize
        }
      }
      start = end
    }
  }

  if (results.length > 0) {
    for (const guildId of guildIds) {
      for (const rank of Object.keys(ranks[guildId])) {
        ranks[guildId][Number(rank)] /= results.length
      }
    }
  }
  return ranks
}

export function aggregateTrials(results: SeasonResult[]): MonteCarloResult {
  const guildIds = [...new Set(results.flatMap((result) => Object.keys(result.guilds)))]
  const rankProbabilities = calculateRanks(results, guildIds)
  const guilds: Record<string, GuildMonteCarloResult> = {}

  for (const guildId of guildIds) {
    const maps = snapshotMaps(results, guildId)
    const minutes = [...new Set(maps.flatMap((map) => [...map.keys()]))].sort((a, b) => a - b)
    const finalSnapshots = maps.map((map) => map.get(minutes.at(-1) ?? 0)).filter(
      (snapshot): snapshot is SeasonSnapshot => Boolean(snapshot),
    )
    const sourceIds = [...new Set(results.flatMap((result) => (
      Object.keys(result.guilds[guildId]?.supplyBySource ?? {})
    )))]

    guilds[guildId] = {
      scoreSeries: buildSeries(maps, minutes, (snapshot) => snapshot.totalScore),
      attackScoreSeries: buildSeries(maps, minutes, (snapshot) => snapshot.attackScore),
      holdingScoreSeries: buildSeries(maps, minutes, (snapshot) => snapshot.holdingScore),
      nodeSeries: {
        normal: buildSeries(maps, minutes, (snapshot) => snapshot.normalNodes),
        core: buildSeries(maps, minutes, (snapshot) => snapshot.coreNodes),
        center: buildSeries(maps, minutes, (snapshot) => snapshot.centerNodes),
      },
      availableFanSeries: buildSeries(maps, minutes, (snapshot) => snapshot.availableFans),
      garrisonFanSeries: buildSeries(maps, minutes, (snapshot) => snapshot.garrisonFans),
      lostFanSeries: buildSeries(maps, minutes, (snapshot) => snapshot.lostFans),
      finalScore: quantiles(results.map((result) => result.guilds[guildId]?.totalScore ?? 0)),
      rankProbabilities: rankProbabilities[guildId],
      actionCapacityBlocks: {
        formation: quantiles(results.map((result) => (
          result.guilds[guildId]?.actionCapacityBlocks.formation ?? 0
        ))),
        cooldown: quantiles(results.map((result) => (
          result.guilds[guildId]?.actionCapacityBlocks.cooldown ?? 0
        ))),
      },
      spend: {
        usd: quantiles(finalSnapshots.map((snapshot) => snapshot.cumulativeUsd)),
        diamonds: quantiles(finalSnapshots.map((snapshot) => snapshot.cumulativeDiamonds)),
        ads: quantiles(finalSnapshots.map((snapshot) => snapshot.cumulativeAds)),
      },
      supplyBySource: Object.fromEntries(sourceIds.map((sourceId) => [sourceId, {
        theoreticalFans: quantiles(results.map((result) => (
          result.guilds[guildId]?.supplyBySource[sourceId]?.theoreticalFans ?? 0
        ))),
        acceptedFans: quantiles(results.map((result) => (
          result.guilds[guildId]?.supplyBySource[sourceId]?.acceptedFans ?? 0
        ))),
        wastedFans: quantiles(results.map((result) => (
          result.guilds[guildId]?.supplyBySource[sourceId]?.wastedFans ?? 0
        ))),
      }])),
    }
  }

  return {
    guilds,
    runsRequested: results.length,
    runsCompleted: results.length,
    cancelled: false,
  }
}
