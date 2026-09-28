import { useId, useRef, useState } from 'react'
import { FUNCTION_SIGNATURES, VARIABLE_SCHEMAS, normalizeFormulaError, type FormulaId, type FormulaErrorDto } from '../domain/formula/types'
import type { Scenario } from '../domain/types'

const FORMULAS: Array<{ id: FormulaId; label: string }> = [
  { id: 'preRandomPower', label: '有效战力' }, { id: 'displayedTendency', label: '显示倾向' },
  { id: 'winProbability', label: '真实胜率' }, { id: 'fanLoss', label: '粉丝损失' },
]
export interface BattleFormulaEditorProps {
  draftScenario: Scenario
  appliedScenario: Scenario
  errors: Partial<Record<FormulaId, FormulaErrorDto>>
  pending: boolean
  onSetString: (path: string, value: string) => void
  onRestore: (formulaId: FormulaId, source: 'applied' | 'default') => void
}

export function BattleFormulaEditor({ draftScenario, appliedScenario, errors, pending, onSetString, onRestore }: BattleFormulaEditorProps) {
  const prefix = useId()
  const [selected, setSelected] = useState<FormulaId>('preRandomPower')
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const source = draftScenario.battle.formulas[selected]
  const error = normalizeFormulaError(errors[selected], errors[selected]?.context ?? 'draft-validation')
  const unapplied = source !== appliedScenario.battle.formulas[selected] || Boolean(error)
  return <div className="formula-editor">
    <div role="tablist" aria-label="战斗公式" className="formula-tabs">
      {FORMULAS.map(({ id, label }, index) => <button
        key={id} type="button" role="tab" ref={node => { tabs.current[index] = node }}
        id={`${prefix}-${id}-tab`} aria-controls={`${prefix}-panel`} aria-selected={selected === id} tabIndex={selected === id ? 0 : -1}
        onClick={() => setSelected(id)} onKeyDown={event => {
          const target = event.key === 'ArrowRight' ? (index + 1) % 4 : event.key === 'ArrowLeft' ? (index + 3) % 4 : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : undefined
          if (target !== undefined) { event.preventDefault(); setSelected(FORMULAS[target].id); tabs.current[target]?.focus() }
        }}
      >{label} <code>{id}</code>{errors[id] ? ' · 错误' : ''}</button>)}
    </div>
    <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${selected}-tab`}>
      <div className="formula-status" role="status">{unapplied ? '当前公式未应用' : '当前公式已应用'}{pending && unapplied ? ' · 正在推演' : ''}</div>
      <label htmlFor={`${prefix}-source`}>{selected} 公式</label>
      <textarea id={`${prefix}-source`} value={source} rows={5} spellCheck={false}
        aria-invalid={Boolean(error)} aria-describedby={`${prefix}-help${error ? ` ${prefix}-error` : ''}`}
        onChange={event => onSetString(`battle.formulas.${selected}`, event.target.value)} />
      <p id={`${prefix}-help`}>只编辑等号右侧表达式，最多 512 字符；停止输入 300 ms 后校验。</p>
      {error ? <p className="field-error" id={`${prefix}-error`} role="alert">{error.message}{error.range ? ` 位置 ${error.range.start + 1}–${Math.max(error.range.start + 1, error.range.end)}` : ''}</p> : null}
      <p className="formula-reference">允许变量：<code>{VARIABLE_SCHEMAS[selected].map(variable => variable.name).join(', ')}</code></p>
      <p className="formula-reference">允许函数：<code>{Object.keys(FUNCTION_SIGNATURES).join(', ')}</code>；常量：PI、E</p>
      <div className="formula-actions"><button type="button" onClick={() => onRestore(selected, 'applied')}>恢复上个有效</button><button type="button" onClick={() => onRestore(selected, 'default')}>恢复默认公式</button></div>
    </div>
  </div>
}
