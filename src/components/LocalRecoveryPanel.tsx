import { useId, useState } from 'react'

interface Props {
  notice: string | null
  recoveryRaw: string | null
  onClearRecovery: () => void
  onReset: () => void
}
export function LocalRecoveryPanel({ notice, recoveryRaw, onClearRecovery, onReset }: Props) {
  const [confirmReset, setConfirmReset] = useState(false)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const id = useId()
  return <section className="local-recovery" aria-label="本地方案">
    <div className="local-recovery__header"><span>方案自动保存在本机</span><button type="button" onClick={() => setConfirmReset(true)}>恢复默认方案</button></div>
    {notice ? <p role="status">{notice}</p> : null}
    {recoveryRaw !== null ? <details><summary>查看恢复数据</summary><label htmlFor={`${id}-raw`}>恢复数据 JSON</label><textarea id={`${id}-raw`} readOnly value={recoveryRaw} rows={5} />
      <div className="formula-actions"><button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(recoveryRaw); setCopyNotice('已复制恢复数据。') } catch { setCopyNotice('复制失败，请选择上方文本手动复制。') }
      }}>复制 JSON</button><button type="button" onClick={onClearRecovery}>清除备份</button></div>
      {copyNotice ? <p role="status">{copyNotice}</p> : null}
    </details> : null}
    {confirmReset ? <div className="reset-confirmation" role="dialog" aria-labelledby={`${id}-reset-title`}>
      <h3 id={`${id}-reset-title`}>恢复默认方案？</h3><p>将清除本机方案和恢复备份，重新载入默认参数与公式。</p>
      <div className="formula-actions"><button type="button" onClick={() => setConfirmReset(false)}>取消</button><button type="button" onClick={() => { onReset(); setConfirmReset(false) }}>确认恢复默认</button></div>
    </div> : null}
  </section>
}
