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
        scenario={state.draft}
        validation={state.validation}
        analysis={state.analysis}
        analysisValidation={state.analysisValidation}
        onSetNumber={(path, value) => dispatch({ type: 'set-number', path, value })}
        onSetBoolean={(path, value) => dispatch({ type: 'set-boolean', path, value })}
        onSetString={(path, value) => dispatch({ type: 'set-string', path, value })}
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
  it('keeps the slider and numeric capacity input synchronized', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)
    const number = screen.getByLabelText('粉丝池上限')
    await user.clear(number)
    await user.type(number, '4000')
    expect(screen.getByTestId('fans.capacity-slider')).toHaveValue('4000')
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
})
