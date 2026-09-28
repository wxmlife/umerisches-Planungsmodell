import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSeededRng } from '../../domain/rng'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { runSeason } from '../../domain/season'
import { RewardDashboardPanel } from '../RewardDashboardPanel'

function input() {
  const scenario = structuredClone(DEFAULT_SCENARIO)
  const season = runSeason(scenario, createSeededRng(20_260_924), 'deterministic')
  return { scenario, season }
}

describe('RewardDashboardPanel', () => {
  it('shows deterministic settlement, resource IDs, titles, and independent legacy sources', () => {
    const { scenario, season } = input()
    render(<RewardDashboardPanel scenario={scenario} season={season} />)

    expect(screen.getByRole('heading', { name: '六日公会奖励模型' })).toBeVisible()
    expect(screen.getByText('目标 110,000 积分')).toBeVisible()
    expect(screen.getByRole('table', { name: '奖励发行按资源和来源' })).toBeVisible()
    expect(screen.getAllByText('聊天称号').length).toBeGreaterThan(0)
    expect(screen.getByText('旧配置单次口径（每条来源独立，不相加成统一价值）')).toBeVisible()
    expect(screen.getByRole('table', { name: '旧商店兑换审计' })).toBeVisible()
    expect(screen.getByText('IAP 全员发行')).toBeVisible()
    expect(screen.getByText(/商店兑换是战功回收池/)).toBeVisible()
    expect(screen.getByRole('img', { name: '按资源和来源拆分的奖励发行量' })).toBeInTheDocument()
  })

  it('switches between guild and tier catalogs while keeping empty rows explicit', async () => {
    const user = userEvent.setup()
    const { scenario } = input()
    scenario.guilds.forEach((guild) => { guild.roster.small = 0; guild.roster.whale = 0 })
    const normalOnlySeason = runSeason(scenario, createSeededRng(20_260_924), 'deterministic')
    render(<RewardDashboardPanel scenario={scenario} season={normalOnlySeason} />)
    const detail = screen.getByRole('table', { name: '玩家奖励明细' })
    expect(within(detail).getAllByRole('row').length).toBeGreaterThan(1)
    await user.selectOptions(screen.getByLabelText('奖励查看维度'), 'tier')
    await user.selectOptions(screen.getByLabelText('奖励目标目录'), 'small')
    expect(within(screen.getByRole('table', { name: '玩家奖励明细' })).getByText('当前目录暂无锁定成员。')).toBeVisible()
  })

  it('keeps interactive selectors outside stale result scope', () => {
    const { scenario, season } = input()
    const { container } = render(<RewardDashboardPanel scenario={scenario} season={season} stale busy />)
    expect(screen.getByLabelText('奖励查看维度').closest('[data-stale="true"]')).toBeNull()
    expect(screen.getByLabelText('奖励目标目录').closest('[data-stale="true"]')).toBeNull()
    expect(container.querySelector('.result-content[data-stale="true"]')).toBeTruthy()
  })
})
