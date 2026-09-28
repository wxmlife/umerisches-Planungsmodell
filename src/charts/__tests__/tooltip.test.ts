import { describe, expect, it } from 'vitest'
import { seasonChartTooltip } from '../tooltip'

const snapshot = (guildId: string, totalScore: number) => ({
  minute: 60,
  day: 1,
  guildId,
  totalScore,
  attackScore: totalScore,
  holdingScore: 0,
  normalNodes: 1,
  coreNodes: 0,
  centerNodes: 0,
  availableFans: 1000,
  garrisonFans: 1000,
  lostFans: 0,
  cumulativeUsd: 0,
  cumulativeDiamonds: 0,
  cumulativeAds: 0,
})

describe('season chart tooltip', () => {
  it('shows every guild represented at the hovered time', () => {
    const html = seasonChartTooltip([
      { data: { meta: { snapshot: snapshot('A', 12) } } },
      { data: { meta: { snapshot: snapshot('B', 9) } } },
    ])

    expect(html).toContain('公会 A')
    expect(html).toContain('累计积分：12')
    expect(html).toContain('公会 B')
    expect(html).toContain('累计积分：9')
  })
})
