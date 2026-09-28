import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildCumulativeSpendSeries } from '../../charts/cumulativeSpend'
import { SAMPLE_SPEND_EVENTS } from '../../test/fixtures'
import { CumulativeSpendPanel } from '../CumulativeSpendPanel'

describe('CumulativeSpendPanel', () => {
  it('keeps cash, diamonds, and ads separate without a diamond rate', () => {
    render(<CumulativeSpendPanel events={SAMPLE_SPEND_EVENTS} diamondUsdRate={null} />)
    expect(screen.getByText('$12.96')).toBeVisible()
    expect(screen.getByText('60 钻')).toBeVisible()
    expect(screen.getByText('4 次广告')).toBeVisible()
    expect(screen.queryByText('统一总价值')).not.toBeInTheDocument()
  })

  it('adds a unified total only after a diamond USD rate is supplied', () => {
    render(<CumulativeSpendPanel events={SAMPLE_SPEND_EVENTS} diamondUsdRate={0.01} />)
    expect(screen.getByText('统一总价值')).toBeVisible()
    expect(screen.getByText('$13.56')).toBeVisible()
  })

  it('reconciles a day-three tooltip to ledger events through that cutoff', () => {
    const series = buildCumulativeSpendSeries(SAMPLE_SPEND_EVENTS, 'guild')
    expect(series.totals.find((point) => point.minute === 3 * 1440)?.cashUsd).toBe(
      SAMPLE_SPEND_EVENTS
        .filter((event) => event.minute <= 3 * 1440)
        .reduce((sum, event) => sum + event.usd, 0),
    )
  })

  it('groups the same immutable ledger by guild, tier, and offer', () => {
    expect(Object.keys(buildCumulativeSpendSeries(SAMPLE_SPEND_EVENTS, 'guild').byGroup)).toEqual(['A', 'B', 'C', 'D'])
    expect(Object.keys(buildCumulativeSpendSeries(SAMPLE_SPEND_EVENTS, 'tier').byGroup).sort()).toEqual(['normal', 'small', 'whale'])
    expect(Object.keys(buildCumulativeSpendSeries(SAMPLE_SPEND_EVENTS, 'offer').byGroup)).toContain('flyer')
  })
})
