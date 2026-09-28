export function resultStatusMessage({
  valid,
  stale,
  runStatus,
}: {
  valid: boolean
  stale: boolean
  runStatus: 'idle' | 'running' | 'cancelling' | 'error'
}): string | null {
  if (!valid) return '输入无效：结果区保留并淡化上一次有效推演。'
  if (!stale) return null
  return runStatus === 'error'
    ? '基准推演失败：保留并淡化上一次有效结果。'
    : '参数已更新，正在刷新基准推演…'
}
