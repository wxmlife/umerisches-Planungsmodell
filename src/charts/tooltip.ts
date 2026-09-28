import type { SeasonSnapshot } from '../domain/season'

function number(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits })
}

export function formatSeasonSnapshotTooltip(
  snapshot: SeasonSnapshot,
  previous?: SeasonSnapshot,
): string {
  const periodGain = previous ? snapshot.totalScore - previous.totalScore : snapshot.totalScore
  const nodeCount = snapshot.normalNodes + snapshot.coreNodes + snapshot.centerNodes
  return [
    `<strong>第 ${snapshot.day} 日 · ${snapshot.minute} 分钟</strong>`,
    `当期增量：${number(periodGain)}`,
    `累计积分：${number(snapshot.totalScore)}`,
    `战斗 / 占领：${number(snapshot.attackScore)} / ${number(snapshot.holdingScore)}`,
    `节点数：${number(nodeCount, 0)}`,
    `可用 / 驻守 / 损失粉丝：${number(snapshot.availableFans, 0)} / ${number(snapshot.garrisonFans, 0)} / ${number(snapshot.lostFans, 0)}`,
    `累计消费：$${snapshot.cumulativeUsd.toFixed(2)} · ${number(snapshot.cumulativeDiamonds, 0)} 钻 · ${number(snapshot.cumulativeAds, 0)} 次广告`,
  ].join('<br/>')
}

interface TooltipDatum {
  meta?: { snapshot?: SeasonSnapshot; previous?: SeasonSnapshot }
}

interface TooltipParameter {
  data?: TooltipDatum
}

export function seasonChartTooltip(parameters: unknown): string {
  const list = Array.isArray(parameters) ? parameters : [parameters]
  const parameter = list.find((item): item is TooltipParameter => Boolean(
    item && typeof item === 'object' && 'data' in item,
  ))
  const snapshot = parameter?.data?.meta?.snapshot
  return snapshot
    ? formatSeasonSnapshotTooltip(snapshot, parameter?.data?.meta?.previous)
    : ''
}
