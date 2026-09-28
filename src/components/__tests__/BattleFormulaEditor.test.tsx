import { useReducer } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFormulaScenario } from '../../test/fixtures'
import { createSimulatorState, simulatorReducer } from '../../state/simulatorReducer'
import { BattleFormulaEditor } from '../BattleFormulaEditor'

function Harness() {
  const [state, dispatch] = useReducer(simulatorReducer, createFormulaScenario(), createSimulatorState)
  return <BattleFormulaEditor draftScenario={state.draftScenario} appliedScenario={state.appliedScenario} errors={state.formulaErrors} pending={Boolean(state.pendingScenario)} onSetString={(path, value) => dispatch({ type: 'set-string', path, value })} onRestore={(formulaId, source) => dispatch({ type: 'restore-formula', formulaId, source })} />
}

describe('BattleFormulaEditor', () => {
  it('exposes four formula tabs, whitelists and per-field restoration without dropping another draft', () => {
    render(<Harness />)
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByText(/允许函数/)).toHaveTextContent('uniformWinProbability')
    fireEvent.change(screen.getByLabelText('preRandomPower 公式'), { target: { value: 'idolPower * 2' } })
    fireEvent.click(screen.getByRole('tab', { name: /fanLoss/ }))
    expect(screen.getByText(/允许变量/)).toHaveTextContent('attackerWon')
    fireEvent.change(screen.getByLabelText('fanLoss 公式'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认公式' }))
    expect(screen.getByLabelText('fanLoss 公式')).toHaveValue('round(currentFans * lossBandRate * sideLossFactor)')
    fireEvent.click(screen.getByRole('tab', { name: /preRandomPower/ }))
    expect(screen.getByLabelText('preRandomPower 公式')).toHaveValue('idolPower * 2')
    fireEvent.click(screen.getByRole('button', { name: '恢复上个有效' }))
    expect(screen.getByLabelText('preRandomPower 公式')).not.toHaveValue('idolPower * 2')
  })
})
