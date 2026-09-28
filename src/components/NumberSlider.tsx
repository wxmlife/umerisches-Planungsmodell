import { useState } from 'react'

export interface NumberSliderProps {
  path: string
  label: string
  min: number
  max: number
  step: number
  value: number
  error?: string
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
  onChange,
}: NumberSliderProps) {
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
        <label htmlFor={`${path}-number`}>{label}</label>
        <input
          id={`${path}-number`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={textValue}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${path}-error` : undefined}
          onChange={(event) => updateFromText(event.target.value)}
        />
      </div>
      <input
        aria-label={`${label}滑杆`}
        data-testid={`${path}-slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          setInputState({ sourceValue: value, text: event.target.value })
          onChange(path, parsed)
        }}
      />
      {error ? <p className="field-error" id={`${path}-error`}>{error}</p> : null}
    </div>
  )
}
