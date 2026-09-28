import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeasonResult } from '../../domain/season'
import type { SensitivityResult } from '../../domain/sensitivity'
import { SupplyEfficiencyPanel } from '../SupplyEfficiencyPanel'

const season: SeasonResult = {
  guilds: {
    A: {
      totalScore: 100,
      attackScore: 60,
      holdingScore: 40,
      defenderGuildScore: 0,
      personalDefenseContribution: 0,
      maxSimultaneousGarrisons: 1,
      maxGarrisonsPerPlayer: 1,
      returnedOverflowFans: 0,
      supplyBySource: {
        flyer: { theoreticalFans: 2000, acceptedFans: 1500, wastedFans: 500 },
      },
    },
  },
  snapshots: [],
  events: [],
  spendEvents: [],
  eventCount: 0,
  termination: 'season-end',
  invariants: { singleOwnerPerNode: true, nonnegativeFans: true, holdingScoreReconciled: true },
}

const sensitivity: SensitivityResult = {
  request: { parameter: 'supply.dailyUsdBudget', metric: 'firstPlaceProbability', min: 0, max: 10, step: 5, targetGuildId: 'A', runs: 10, seed: 1 },
  cancelled: false,
  points: [
    { x: 0, metricValue: 0.4, finalScore: 100, firstPlaceProbability: 0.4, nodeCounts: { normal: 10, core: 1, center: 0 }, usd: 0, diamonds: 0, ads: 0, acceptedFans: 0, wastedFans: 0 },
    { x: 5, metricValue: 0.55, finalScore: 120, firstPlaceProbability: 0.55, nodeCounts: { normal: 12, core: 1, center: 0 }, usd: 5, diamonds: 0, ads: 0, acceptedFans: 1500, wastedFans: 500 },
    { x: 10, metricValue: 0.82, finalScore: 140, firstPlaceProbability: 0.82, nodeCounts: { normal: 14, core: 2, center: 0 }, usd: 10, diamonds: 0, ads: 0, acceptedFans: 3000, wastedFans: 1000 },
  ],
}

describe('SupplyEfficiencyPanel', () => {
  it('shows recovery utilization and observed spend thresholds', () => {
    render(<SupplyEfficiencyPanel guildId="A" season={season} sensitivity={sensitivity} />)
    expect(screen.getByText('75.0%')).toBeVisible()
    expect(screen.getByText('$5.00 / 日')).toBeVisible()
    expect(screen.getByText('$10.00 / 日')).toBeVisible()
  })

  it('shows the action-capacity reason only when the scheduler proves it', () => {
    const { rerender } = render(
      <SupplyEfficiencyPanel
        guildId="A"
        season={season}
        sensitivity={sensitivity}
        targetNodes={{ normal: 20, core: 3, center: 1 }}
      />,
    )
    expect(screen.queryByText('资源足够，行动容量不足')).not.toBeInTheDocument()
    rerender(
      <SupplyEfficiencyPanel
        guildId="A"
        season={season}
        sensitivity={sensitivity}
        targetNodes={{ normal: 20, core: 3, center: 1 }}
        actionCapacityBound
      />,
    )
    expect(screen.getByText('资源足够，行动容量不足')).toBeVisible()
  })

  it('does not label a non-budget sensitivity axis as daily spend', () => {
    const alphaSensitivity: SensitivityResult = {
      ...sensitivity,
      request: {
        ...sensitivity.request,
        parameter: 'battle.alpha',
        min: 1,
        max: 2,
        step: 0.5,
      },
    }
    render(
      <SupplyEfficiencyPanel
        guildId="A"
        season={season}
        sensitivity={alphaSensitivity}
        targetNodes={{ normal: 12, core: 1, center: 0 }}
      />,
    )

    expect(screen.getAllByText('需运行日预算扫描')).toHaveLength(3)
    expect(screen.queryByText('$5.00 / 日')).not.toBeInTheDocument()
  })
})
