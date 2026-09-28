import type { MonteCarloResult, QuantilePoint, Quantiles } from '../domain/aggregate'
import type { SpendEvent } from '../domain/economy'

const zero: Quantiles = { p10: 0, median: 0, p90: 0, mean: 0 }
const zeroPoint: QuantilePoint = { minute: 0, ...zero }
const scorePoint: QuantilePoint = {
  minute: 0,
  p10: 10,
  median: 20,
  p90: 30,
  mean: 20,
}

export const SAMPLE_MONTE_CARLO_RESULT: MonteCarloResult = {
  guilds: {
    A: {
      scoreSeries: [scorePoint],
      attackScoreSeries: [zeroPoint],
      holdingScoreSeries: [zeroPoint],
      nodeSeries: {
        normal: [zeroPoint],
        core: [zeroPoint],
        center: [zeroPoint],
      },
      availableFanSeries: [zeroPoint],
      garrisonFanSeries: [zeroPoint],
      lostFanSeries: [zeroPoint],
      finalScore: scorePoint,
      rankProbabilities: { 1: 1 },
      spend: { usd: zero, diamonds: zero, ads: zero },
      supplyBySource: {},
    },
  },
  runsRequested: 3,
  runsCompleted: 3,
  cancelled: false,
}

export const SAMPLE_SPEND_EVENTS: SpendEvent[] = [
  { minute: 0, guildId: 'A', playerId: 'A-whale-1', tier: 'whale', offerId: 'flyer', usd: 0.99, diamonds: 0, ads: 0 },
  { minute: 60, guildId: 'A', playerId: 'A-whale-1', tier: 'whale', offerId: 'cheer-stick', usd: 2.99, diamonds: 0, ads: 0 },
  { minute: 100, guildId: 'A', playerId: 'A-normal-1', tier: 'normal', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
  { minute: 1440, guildId: 'B', playerId: 'B-small-1', tier: 'small', offerId: 'instant-600', usd: 2.99, diamonds: 0, ads: 0 },
  { minute: 1500, guildId: 'B', playerId: 'B-small-1', tier: 'small', offerId: 'ad-or-diamond-diamond', usd: 0, diamonds: 20, ads: 0 },
  { minute: 1600, guildId: 'B', playerId: 'B-small-1', tier: 'small', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
  { minute: 2880, guildId: 'C', playerId: 'C-normal-1', tier: 'normal', offerId: 'instant-1000', usd: 5.99, diamonds: 0, ads: 0 },
  { minute: 2900, guildId: 'C', playerId: 'C-normal-1', tier: 'normal', offerId: 'ad-or-diamond-diamond', usd: 0, diamonds: 20, ads: 0 },
  { minute: 3000, guildId: 'C', playerId: 'C-normal-1', tier: 'normal', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
  { minute: 4320, guildId: 'D', playerId: 'D-normal-1', tier: 'normal', offerId: 'ad-or-diamond-diamond', usd: 0, diamonds: 20, ads: 0 },
  { minute: 4400, guildId: 'D', playerId: 'D-normal-1', tier: 'normal', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
]
