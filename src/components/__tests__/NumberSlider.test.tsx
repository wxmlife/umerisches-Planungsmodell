import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberSlider } from '../NumberSlider'

function SharedNumberHarness() {
  const [value, setValue] = useState(3)
  return <>
    <NumberSlider path="battle.tierMultipliers.small" label="侧栏倍率" value={value} min={0.1} max={20} step={0.1} onChange={(_, next) => setValue(next)} />
    <NumberSlider path="battle.tierMultipliers.small" label="快捷倍率" value={value} min={0.1} max={20} step={0.1} onChange={(_, next) => setValue(next)} />
    <button type="button" onClick={() => setValue(3)}>恢复默认值</button>
    <output aria-label="场景倍率">{value}</output>
  </>
}

describe('shared direct numeric controls', () => {
  it.each([['侧栏倍率', '快捷倍率'], ['快捷倍率', '侧栏倍率']])('keeps the 3 → 4 → 3 round trip synchronized from %s to %s', (first, second) => {
    render(<SharedNumberHarness />)
    fireEvent.change(screen.getByLabelText(first), { target: { value: '4' } })
    expect(screen.getByLabelText(second)).toHaveValue(4)
    fireEvent.change(screen.getByLabelText(second), { target: { value: '3' } })
    expect(screen.getByLabelText(first)).toHaveValue(3)
    expect(screen.getByLabelText(second)).toHaveValue(3)
    expect(screen.getByLabelText('场景倍率')).toHaveTextContent('3')
  })

  it('resets both edited controls without reviving old cached text', () => {
    render(<SharedNumberHarness />)
    fireEvent.change(screen.getByLabelText('侧栏倍率'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认值' }))
    expect(screen.getByLabelText('侧栏倍率')).toHaveValue(3)
    expect(screen.getByLabelText('快捷倍率')).toHaveValue(3)
    fireEvent.change(screen.getByLabelText('快捷倍率'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认值' }))
    expect(screen.getByLabelText('侧栏倍率')).toHaveValue(3)
    expect(screen.getByLabelText('快捷倍率')).toHaveValue(3)
  })

  it('discards an unfinished local value after external updates cycle back', () => {
    render(<SharedNumberHarness />)
    fireEvent.change(screen.getByLabelText('侧栏倍率'), { target: { value: '' } })
    expect(screen.getByLabelText('侧栏倍率')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('快捷倍率'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('快捷倍率'), { target: { value: '3' } })
    expect(screen.getByLabelText('侧栏倍率')).toHaveValue(3)
  })
})
