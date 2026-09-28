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
        onSetNumber={(path, value) => dispatch({ type: 'set-number', path, value })}
        onSetBoolean={(path, value) => dispatch({ type: 'set-boolean', path, value })}
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

  it('lets the designer enable reward ads for each player tier', async () => {
    const user = userEvent.setup()
    render(<ParameterSidebarHarness />)

    const shopSection = screen.getByText('商城').closest('details')
    expect(shopSection).not.toHaveAttribute('open')
    await user.click(screen.getByText('商城'))
    expect(shopSection).toHaveAttribute('open')

    const toggles = screen.getAllByRole('checkbox', { name: /使用奖励广告/ })
    expect(toggles).toHaveLength(3)
    expect(toggles[0]).not.toBeChecked()
    await user.click(toggles[0])
    expect(toggles[0]).toBeChecked()
    expect(shopSection).toHaveAttribute('open')
  })
})
