import { describe, expect, it } from 'vitest'
import { runSeason, type SeasonResult } from '../season'
import { aggregateTrials, quantiles } from '../aggregate'
import { aggregateSpend } from '../economy'
import { createSeededRng } from '../rng'
import { createPurchaseScenario } from '../../test/fixtures'

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
      actionCapacityBlocks: { formation: 0, cooldown: 0 },
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
    spendEvents: Object.keys(scores).map((guildId) => ({
      minute: 60, guildId, playerId: `${guildId}-normal-1`, tier: 'normal',
      offerId: 'mixed-supply', usd: 1, diamonds: 20, ads: 1,
    })),
    eventCount: 0,
    termination: 'season-end',
    terminationMinute: null,
    invariants: {
      singleOwnerPerNode: true,
      nonnegativeFans: true,
      holdingScoreReconciled: true,
    },
  }
}

describe('trial aggregation', () => {
  it('reconciles per-guild version spending with actual ledgers and final snapshots', () => {
    const scenario = createPurchaseScenario({ versionUsdBudget: 6, versionDiamondBudget: 6, versionAdBudget: 6, useAds: true })
    Object.assign(scenario.supply.offers[0], { diamondCost: 1, adCost: 1 })
    scenario.guilds.push({ ...structuredClone(scenario.guilds[0]), id: 'B', name: 'B' })
    scenario.guilds[1].purchasePolicies.normal.supplyPriority = []
    const season = runSeason(scenario, createSeededRng(1), 'stochastic')
    const aggregate = aggregateTrials([season])
    for (const guildId of ['A', 'B']) {
      const totals = aggregateSpend(season.spendEvents.filter((event) => event.guildId === guildId))
      const final = season.snapshots.filter((snapshot) => snapshot.guildId === guildId).at(-1)!
      expect(final).toMatchObject({ cumulativeUsd: totals.usd, cumulativeDiamonds: totals.diamonds, cumulativeAds: totals.ads })
      expect(aggregate.guilds[guildId].spend).toMatchObject({ usd: { mean: totals.usd }, diamonds: { mean: totals.diamonds }, ads: { mean: totals.ads } })
    }
    expect(aggregate.guilds.A.spend).toMatchObject({ usd: { mean: 6 }, diamonds: { mean: 6 }, ads: { mean: 6 } })
    expect(aggregate.guilds.B.spend).toMatchObject({ usd: { mean: 0 }, diamonds: { mean: 0 }, ads: { mean: 0 } })
  })
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
