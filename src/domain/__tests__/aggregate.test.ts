import { describe, expect, it } from 'vitest'
import type { SeasonResult } from '../season'
import { aggregateTrials, quantiles } from '../aggregate'

function resultWithScores(scores: Record<string, number>): SeasonResult {
  return {
    guilds: Object.fromEntries(Object.entries(scores).map(([guildId, score]) => [guildId, {
      totalScore: score,
      attackScore: score * 0.6,
      holdingScore: score * 0.4,
      defenderGuildScore: 0 as const,
      personalDefenseContribution: 0,
      maxSimultaneousGarrisons: 0,
      maxGarrisonsPerPlayer: 0,
      returnedOverflowFans: 0,
      supplyBySource: {},
    }])),
    snapshots: Object.entries(scores).flatMap(([guildId, score]) => [
      {
        minute: 0,
        day: 1,
        guildId,
        totalScore: 0,
        attackScore: 0,
        holdingScore: 0,
        normalNodes: 0,
        coreNodes: 0,
        centerNodes: 0,
        availableFans: 2000,
        garrisonFans: 0,
        lostFans: 0,
        cumulativeUsd: 0,
        cumulativeDiamonds: 0,
        cumulativeAds: 0,
      },
      {
        minute: 60,
        day: 1,
        guildId,
        totalScore: score,
        attackScore: score * 0.6,
        holdingScore: score * 0.4,
        normalNodes: 1,
        coreNodes: 0,
        centerNodes: 0,
        availableFans: 1000,
        garrisonFans: 1000,
        lostFans: 100,
        cumulativeUsd: 1,
        cumulativeDiamonds: 20,
        cumulativeAds: 1,
      },
    ]),
    events: [],
    spendEvents: [],
    eventCount: 0,
    termination: 'season-end',
    invariants: {
      singleOwnerPerNode: true,
      nonnegativeFans: true,
      holdingScoreReconciled: true,
    },
  }
}

describe('trial aggregation', () => {
  it('calculates interpolated quantiles without mutating the input', () => {
    const values = [40, 10, 30, 20]
    expect(quantiles(values)).toEqual({ p10: 13, median: 25, p90: 37, mean: 25 })
    expect(values).toEqual([40, 10, 30, 20])
  })

  it('aligns hourly values and aggregates each score source', () => {
    const aggregate = aggregateTrials([
      resultWithScores({ A: 10 }),
      resultWithScores({ A: 30 }),
    ])
    expect(aggregate.guilds.A.finalScore).toEqual({
      p10: 12,
      median: 20,
      p90: 28,
      mean: 20,
    })
    expect(aggregate.guilds.A.scoreSeries.map((point) => point.minute)).toEqual([0, 60])
    expect(aggregate.guilds.A.attackScoreSeries.at(-1)?.mean).toBe(12)
    expect(aggregate.guilds.A.holdingScoreSeries.at(-1)?.mean).toBe(8)
  })

  it('splits occupied rank probability evenly across exact ties', () => {
    const aggregate = aggregateTrials([resultWithScores({ A: 100, B: 100, C: 80 })])
    expect(aggregate.guilds.A.rankProbabilities).toMatchObject({ 1: 0.5, 2: 0.5 })
    expect(aggregate.guilds.B.rankProbabilities).toMatchObject({ 1: 0.5, 2: 0.5 })
    expect(aggregate.guilds.C.rankProbabilities[3]).toBe(1)
  })
})
