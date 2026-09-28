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
      />
      <RunToolbar
        valid={state.validation.valid}
        sensitivityValid
        status={state.runStatus}
        progress={state.progress}
        errorMessage={state.errorMessage}
        onRunMonteCarlo={vi.fn()}
        onRunSensitivity={vi.fn()}
        onCancel={vi.fn()}
      />
      <div data-testid="last-valid-result" data-stale={String(state.stale)} />
    </>
  )
}

describe('RunToolbar', () => {
  it('shows the exact deployment error and disables Monte Carlo', async () => {
    const user = userEvent.setup()
    render(<SimulatorHarness />)
    const number = screen.getByLabelText('单次最高出战')
    await user.clear(number)
    await user.type(number, '2001')
    expect(screen.getByText('单次最高出战不能超过粉丝池上限')).toBeVisible()
    expect(screen.getByRole('button', { name: '运行蒙特卡洛' })).toBeDisabled()
    expect(screen.getByTestId('last-valid-result')).toHaveAttribute('data-stale', 'true')
  })

  it('reports progress and exposes cancellation while running', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    render(
      <RunToolbar
        valid
        sensitivityValid
        status="running"
        progress={{ completed: 23, total: 100 }}
        onRunMonteCarlo={vi.fn()}
        onRunSensitivity={vi.fn()}
        onCancel={cancel}
      />,
    )
    expect(screen.getByText('已完成 23 / 100')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '取消运行' }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('shows the explicit simulation failure reason', () => {
    render(
      <RunToolbar
        valid
        sensitivityValid
        status="error"
        progress={null}
        errorMessage="第 1 日 60 分钟触发单日最大事件数 100"
        onRunMonteCarlo={vi.fn()}
        onRunSensitivity={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('第 1 日 60 分钟触发单日最大事件数 100')
  })
})
