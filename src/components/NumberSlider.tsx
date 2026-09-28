import { useId, useState } from 'react'

export interface NumberSliderProps {
  path: string
  label: string
  min: number
  max: number
  step: number
  value: number
  error?: string
  idPrefix?: string
  onChange: (path: string, value: number) => void
}

export function NumberSlider({
  path,
  label,
  min,
  max,
  step,
  value,
  error,
  idPrefix = 'parameter',
  onChange,
}: NumberSliderProps) {
  const uniqueId = useId()
  const id = `${idPrefix}-${uniqueId}-${path}`
  const [inputState, setInputState] = useState({
    sourceValue: value,
    text: String(value),
  })
  const textValue = inputState.sourceValue === value
    ? inputState.text
    : String(value)

  const updateFromText = (nextText: string) => {
    setInputState({ sourceValue: value, text: nextText })
    if (nextText.trim() === '') return
    const parsed = Number(nextText)
    if (Number.isFinite(parsed)) onChange(path, parsed)
  }

  return (
    <div className="number-control" data-path={path}>
      <div className="number-control__header">
        <label htmlFor={`${id}-number`}>{label}</label>
        <input
          id={`${id}-number`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={textValue}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-guidance`}
          onChange={(event) => updateFromText(event.target.value)}
          onBlur={() => { if (textValue.trim() === '') setInputState({ sourceValue: value, text: String(value) }) }}
        />
      </div>
      <small className="number-control__guidance" id={`${id}-guidance`}>参考范围 {min}–{max} · 步长 {step}</small>
      {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : null}
    </div>
  )
}
