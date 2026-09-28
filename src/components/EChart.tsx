import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { DashboardChartOption } from '../charts/options'

export interface EChartProps {
  option: DashboardChartOption
  label: string
  className?: string
}

export function EChart({ option, label, className = '' }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || (container.clientWidth === 0 && container.clientHeight === 0)) return undefined
    const chart = echarts.init(container, undefined, { renderer: 'svg' })
    chart.setOption(option)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [option])

  return (
    <div
      ref={containerRef}
      className={`chart ${className}`.trim()}
      role="img"
      aria-label={label}
    />
  )
}
