import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import type { SpendEvent } from '../../domain/economy'
import { describe, expect, it } from 'vitest'
import { buildCumulativeSpendSeries } from '../../charts/cumulativeSpend'
import { SAMPLE_SPEND_EVENTS } from '../../test/fixtures'
import { CumulativeSpendPanel } from '../CumulativeSpendPanel'

describe('CumulativeSpendPanel', () => {
  it('keeps cash, diamonds, and ads separate without a diamond rate', () => {
    render(<CumulativeSpendPanel events={SAMPLE_SPEND_EVENTS} scenario={DEFAULT_SCENARIO} />)
    expect(screen.getByText('确定性基准消费')).toBeVisible()
    expect(screen.getAllByText('$12.96')).toHaveLength(2)
    expect(screen.getAllByText('60 钻')).toHaveLength(2)
    expect(screen.getAllByText('4 次广告')).toHaveLength(2)
    const table = screen.getByRole('table', { name: '消费账本汇总' })
    expect(within(table).getByRole('row', { name: /公会 A.*\$3.98.*0 钻.*1 次广告/ })).toBeVisible()
    expect(screen.queryByText('统一总价值')).not.toBeInTheDocument()
  })

  it('adds a unified total only after a diamond USD rate is supplied', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.supply.diamondUsdRate = 0.01
    render(<CumulativeSpendPanel events={SAMPLE_SPEND_EVENTS} scenario={scenario} />)
    expect(screen.getByText('统一总价值')).toBeVisible()
    expect(screen.getByText('$13.56')).toBeVisible()
  })

  it('reconciles a day-three tooltip to ledger events through that cutoff', () => {
    const series = buildCumulativeSpendSeries(input())
    expect(series.totals.find((point) => point.minute === 3 * 1440)?.cashUsd).toBe(
      SAMPLE_SPEND_EVENTS
        .filter((event) => event.minute <= 3 * 1440)
        .reduce((sum, event) => sum + event.usd, 0),
    )
  })

  it('groups the same immutable ledger by guild, tier, and offer', () => {
    expect(Object.keys(buildCumulativeSpendSeries(input()).byGroup)).toEqual(['A', 'B', 'C', 'D'])
    expect(Object.keys(buildCumulativeSpendSeries({ ...input(), dimension: 'tier', groupCatalog: ['normal', 'small', 'whale'].map(id => ({ id, label: id })) }).byGroup)).toEqual(['normal', 'small', 'whale'])
    expect(Object.keys(buildCumulativeSpendSeries({ ...input(), dimension: 'offer', groupCatalog: DEFAULT_SCENARIO.supply.offers }).byGroup)).toHaveLength(7)
  })

  it('keeps zero-event catalog rows and allows currency and dimension selection', async () => {
    const user = userEvent.setup()
    render(<CumulativeSpendPanel events={[]} scenario={DEFAULT_SCENARIO} />)
    expect(screen.getByText(/暂无消费事件/)).toBeVisible()
    expect(screen.getAllByRole('row')).toHaveLength(6)
    await user.selectOptions(screen.getByLabelText('消费指标'), 'diamond')
    expect(screen.getByRole('img', { name: '确定性基准累计钻石消费' })).toBeVisible()
    await user.selectOptions(screen.getByLabelText('分拆维度'), 'tier')
    expect(screen.getAllByRole('row')).toHaveLength(5)
    await user.selectOptions(screen.getByLabelText('分拆维度'), 'offer')
    expect(screen.getAllByRole('row')).toHaveLength(9)
  })

  it('retains partial groups and the exact endpoint without extending past it', () => {
    const empty = buildCumulativeSpendSeries({ ...input(), events: [], endMinute: 1500 })
    expect(empty.totals).toEqual([
      { minute: 0, cashUsd: 0, diamonds: 0, ads: 0 },
      { minute: 1440, cashUsd: 0, diamonds: 0, ads: 0 },
      { minute: 1500, cashUsd: 0, diamonds: 0, ads: 0 },
    ])
    const partial = buildCumulativeSpendSeries({ ...input(), events: SAMPLE_SPEND_EVENTS.slice(0, 3) })
    expect(partial.byGroup.B.at(-1)).toEqual({ minute: 8640, cashUsd: 0, diamonds: 0, ads: 0 })
    expect(partial.byGroup.A.at(-1)).toMatchObject({ minute: 8640, diamonds: 0, ads: 1 })
    expect(partial.byGroup.A.at(-1)?.cashUsd).toBeCloseTo(3.98, 10)
  })

  it('rejects missing keys, unknown groups and events beyond the endpoint', () => {
    expect(() => buildCumulativeSpendSeries({ ...input(), events: [{ ...SAMPLE_SPEND_EVENTS[0], guildId: undefined } as unknown as SpendEvent] })).toThrow(/分组/)
    expect(() => buildCumulativeSpendSeries({ ...input(), groupCatalog: [] })).toThrow(/目录/)
    expect(() => buildCumulativeSpendSeries({ ...input(), endMinute: 1 })).toThrow(/时间/)
  })
})

function input() {
  return {
    events: SAMPLE_SPEND_EVENTS,
    groupCatalog: DEFAULT_SCENARIO.guilds.map(({ id, name }) => ({ id, label: name })),
    endMinute: 8640, metric: 'usd' as const, dimension: 'guild' as const,
    colorResolver: () => '#57A8FF',
  }
}
