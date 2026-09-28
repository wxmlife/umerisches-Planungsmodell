import { useReducer } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import {
  createSimulatorState,
  simulatorReducer,
} from '../../state/simulatorReducer'
import { ParameterSidebar } from '../ParameterSidebar'
import { RunToolbar } from '../RunToolbar'

function SimulatorHarness() {
  const [state, dispatch] = useReducer(
    simulatorReducer,
    DEFAULT_SCENARIO,
    createSimulatorState,
  )
  return (
    <>
      <ParameterSidebar
        scenario={state.draftScenario}
        validation={state.validation}
        analysis={state.analysis}
        analysisValidation={state.analysisValidation}
        onSetNumber={(path, value) => dispatch({ type: 'set-number', path, value })}
        onSetBoolean={(path, value) => dispatch({ type: 'set-boolean', path, value })}
        onSetString={(path, value) => dispatch({ type: 'set-string', path, value })}
        onSetStringArray={(path, value) => dispatch({ type: 'set-string-array', path, value })}
        onSetAnalysisNumber={(path, value) => dispatch({ type: 'set-analysis-number', path, value })}
      />
      <RunToolbar
        valid={state.validation.valid}
        status={state.runStatus}
        progress={state.progress}
        onRunMonteCarlo={vi.fn()}
        onRunSensitivity={vi.fn()}
        onCancel={vi.fn()}
      />
      <div data-testid="last-valid-result" data-stale={String(state.stale)} />
    </>
  )
}

const ParameterSidebarHarness = SimulatorHarness

describe('ParameterSidebar', () => {
  it('keeps priority action input independent of the resulting scenario snapshot', () => {
    const state = createSimulatorState(DEFAULT_SCENARIO)
    const priority = ['flyer']
    const updated = simulatorReducer(state, { type: 'set-string-array', path: 'guilds.0.purchasePolicies.normal.supplyPriority', value: priority })
    priority.push('cheer-stick')
    expect(updated.draftScenario.guilds[0].purchasePolicies.normal.supplyPriority).toEqual(['flyer'])
    expect(state.draftScenario.guilds[0].purchasePolicies.normal.supplyPriority).toHaveLength(7)
  })

  it('defaults the per-person version budget scan to include the whale budget', () => {
    const state = createSimulatorState(DEFAULT_SCENARIO)
    expect(state.analysis).toMatchObject({ sweepMin: 0, sweepMax: 120, sweepStep: 30 })
  })
  it('isolates version budgets and advertising between guilds and tiers', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    await user.click(screen.getByText('公会消费策略'))
    const usd = () => screen.getByLabelText('单人版本美元预算')
    expect(usd()).toHaveValue(0)
    expect(usd()).toHaveAttribute('step', '0.01')
    expect(screen.getByLabelText('单人版本钻石预算')).toHaveValue(120)
    expect(screen.getByLabelText('单人版本钻石预算')).toHaveAttribute('step', '1')
    expect(screen.getByLabelText('单人版本广告预算')).toHaveValue(12)
    expect(screen.getByLabelText('单人版本广告预算')).toHaveAttribute('step', '1')
    expect(screen.getByRole('checkbox', { name: '启用广告' })).toBeChecked()
    await user.clear(usd())
    await user.type(usd(), '7.5')
    await user.click(screen.getByRole('checkbox', { name: '启用广告' }))
    await user.selectOptions(screen.getByLabelText('消费策略公会'), 'B')
    expect(usd()).toHaveValue(0)
    expect(screen.getByRole('checkbox', { name: '启用广告' })).toBeChecked()
    await user.click(screen.getByRole('tab', { name: '小 R' }))
    expect(usd()).toHaveValue(24)
    expect(screen.getByRole('checkbox', { name: '启用广告' })).not.toBeChecked()
    await user.click(screen.getByRole('tab', { name: '大 R' }))
    expect(usd()).toHaveValue(90)
    await user.selectOptions(screen.getByLabelText('消费策略公会'), 'A')
    await user.click(screen.getByRole('tab', { name: '普通' }))
    expect(usd()).toHaveValue(7.5)
    expect(screen.getByRole('checkbox', { name: '启用广告' })).not.toBeChecked()
  })

  it('edits ordered priority subsets while preserving other tiers', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    await user.click(screen.getByText('公会消费策略'))
    const priority = () => screen.getAllByRole('listitem').map(item => item.getAttribute('data-offer-id'))
    expect(priority()).toEqual(['ad-or-diamond-ad', 'ad-or-diamond-diamond', 'flyer', 'cheer-stick', 'instant-2000', 'instant-1000', 'instant-600'])
    await user.click(screen.getByRole('button', { name: '宣传单 上移' }))
    expect(priority().slice(0, 3)).toEqual(['ad-or-diamond-ad', 'flyer', 'ad-or-diamond-diamond'])
    await user.click(screen.getByRole('button', { name: '奖励广告恢复 移除' }))
    expect(priority()).not.toContain('ad-or-diamond-ad')
    await user.click(screen.getByRole('tab', { name: '小 R' }))
    expect(priority()).toEqual(['flyer', 'cheer-stick', 'instant-2000', 'instant-1000', 'instant-600', 'ad-or-diamond-ad', 'ad-or-diamond-diamond'])
    await user.click(screen.getByRole('tab', { name: '普通' }))
    expect(priority()[0]).toBe('flyer')
    await user.selectOptions(screen.getByLabelText('添加购买商品'), 'ad-or-diamond-ad')
    expect(priority().at(-1)).toBe('ad-or-diamond-ad')
    expect(priority()).toHaveLength(7)
  })
  it('supports direct numeric entry without slider rails and retains numeric guidance', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    const number = screen.getByLabelText('粉丝池上限')
    await user.clear(number)
    await user.type(number, '4000')
    expect(number).toHaveValue(4000)
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    expect(number).toHaveAttribute('min', '100')
    expect(number).toHaveAttribute('max', '20000')
    expect(number).toHaveAttribute('step', '100')
    expect(number).toHaveAccessibleDescription(/100.*20000.*100/)
  })

  it('exposes editable reward targets, thresholds, and replacement mode as direct numeric controls', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    await user.click(screen.getByText('奖励模型'))
    const target = screen.getByLabelText('个人奖励目标积分')
    await user.clear(target)
    await user.type(target, '120000')
    expect(target).toHaveValue(120000)
    expect(screen.getByLabelText('每日奖励积分上限')).toHaveValue(22000)
    expect(screen.getByLabelText('旧战令累计进度审计值')).toHaveValue(664000)
    expect(screen.getByLabelText('旧免费奖励处理方式')).toHaveValue('replace')
    await user.selectOptions(screen.getByLabelText('旧免费奖励处理方式'), 'stack')
    expect(screen.getByLabelText('旧免费奖励处理方式')).toHaveValue('stack')
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
  })

  it('shows all seven approved parameter groups', () => {
    render(<ParameterSidebarHarness />)
    for (const heading of ['战斗', '损耗', '粉丝', '地图与积分', '公会', '商城', '模拟']) {
      expect(screen.getByText(heading)).toBeVisible()
    }
  })

  it('keeps the global daily ad limit editable without obsolete global player policies', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)

    const shopSection = screen.getByText('商城').closest('details')
    expect(shopSection).not.toHaveAttribute('open')
    await user.click(screen.getByText('商城'))
    expect(shopSection).toHaveAttribute('open')

    const limit = screen.getByLabelText('每日奖励广告上限')
    await user.clear(limit)
    await user.type(limit, '5')
    expect(limit).toHaveValue(5)
    expect(screen.queryAllByRole('checkbox', { name: /使用奖励广告/ })).toHaveLength(0)
    expect(shopSection).toHaveAttribute('open')
  })

  it('exposes recovery mechanics and global daily purchase limits', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    await user.click(screen.getByText('商城'))

    expect(screen.getByLabelText('宣传单 即时恢复比例')).toBeVisible()
    expect(screen.getByLabelText('宣传单 脉冲 1 时间（分钟）')).toBeVisible()
    expect(screen.getByLabelText('奖励广告恢复 持续时间（分钟）')).toBeVisible()
    expect(screen.getByLabelText('即时补给 600 固定恢复粉丝')).toBeVisible()
    expect(screen.getByLabelText('宣传单 每日限购（0=不限）')).toBeVisible()
  })

  it('shows parent validation errors beside the affected numeric fields', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    await user.click(screen.getByText('地图与积分'))
    const attackScore = screen.getByLabelText('进攻获胜基础分')
    await user.clear(attackScore)
    await user.type(attackScore, '-1')

    expect(screen.getAllByText('积分不能为负数').length).toBeGreaterThan(0)
    expect(attackScore).toHaveAccessibleDescription('积分不能为负数')
  })

  it('shows a scan-range error next to the scan controls', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    const max = screen.getByLabelText('预算扫描最大值')
    await user.clear(max)
    await user.type(max, '0')
    const min = screen.getByLabelText('预算扫描最小值')
    await user.clear(min)
    await user.type(min, '5')

    expect(screen.getByText('扫描最大值不能小于最小值')).toBeVisible()
    expect(min).toHaveAccessibleDescription('扫描最大值不能小于最小值')
  })
  it('shows invalid target node values beside the direct numeric control', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    const target = screen.getByLabelText('目标普通节点')
    await user.clear(target)
    await user.type(target, '-1')
    expect(target).toHaveAttribute('aria-invalid', 'true')
    expect(target).toHaveAccessibleDescription('目标节点数必须是非负整数')
  })
})
