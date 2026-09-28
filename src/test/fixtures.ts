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

export const SAMPLE_SPEND_EVENTS: SpendEvent[] = []
