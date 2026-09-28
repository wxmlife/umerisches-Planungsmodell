import { useEffect, useRef } from 'react'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use as registerEChartsModules } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { DashboardChartOption } from '../charts/options'

registerEChartsModules([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
])

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
    const chart = init(container, undefined, { renderer: 'svg' })
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
