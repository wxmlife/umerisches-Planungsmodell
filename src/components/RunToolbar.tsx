export interface RunToolbarProps {
  valid: boolean
  status: 'idle' | 'running' | 'cancelling' | 'error'
  progress: { completed: number; total: number } | null
  onRunMonteCarlo: () => void
  onRunSensitivity: () => void
  onCancel: () => void
}

export function RunToolbar({
  valid,
  status,
  progress,
  onRunMonteCarlo,
  onRunSensitivity,
  onCancel,
}: RunToolbarProps) {
  const busy = status === 'running' || status === 'cancelling'
  return (
    <section className="run-toolbar" aria-label="模拟运行控制">
      <button type="button" disabled={!valid || busy} onClick={onRunMonteCarlo}>
        运行蒙特卡洛
      </button>
      <button type="button" disabled={!valid || busy} onClick={onRunSensitivity}>
        运行敏感性分析
      </button>
      {busy ? (
        <button type="button" disabled={status === 'cancelling'} onClick={onCancel}>
          {status === 'cancelling' ? '正在取消' : '取消运行'}
        </button>
      ) : null}
      {progress ? (
        <span role="status">已完成 {progress.completed} / {progress.total}</span>
      ) : null}
      {status === 'error' ? <span role="alert">运行失败</span> : null}
    </section>
  )
}
