import { useMemo, useState } from 'react'
import { buildRewardIssuanceOption } from '../charts/options'
import { resolveGuildColors } from '../charts/colors'
import { REWARD_RESOURCE_LABELS, formatRewardItems, rewardResourceLabel } from '../domain/rewardCatalog'
import type { MonteCarloResult } from '../domain/aggregate'
import {
  calculateLegacyRewardAudit,
  calculateRewardModel,
  type LegacyRewardAuditResult,
  type RewardDistribution,
  type RewardModelResult,
} from '../domain/rewards'
import type { SeasonResult } from '../domain/season'
import type { RewardConfig, Scenario, Tier } from '../domain/types'
import { EChart } from './EChart'

type RewardDimension = 'guild' | 'tier' | 'player'

const TIER_LABELS: Record<Tier, string> = { normal: '普通', small: '小 R', whale: '大 R' }
const SOURCE_LABELS = {
  personal: '个人进度', guild: '公会里程碑', rank: '结算排名', titles: '聊天称号', legacyFree: '旧免费奖励（叠加）',
} as const

function integer(value: number): string {
  return Math.round(value).toLocaleString('zh-CN')
}

function rate(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function rewardConfigResourceIds(config: RewardConfig): number[] {
  const ids = [
    ...config.personalStages.flatMap((stage) => stage.rewards.map((item) => item.resourceId)),
    ...config.guildMilestones.flatMap((milestone) => milestone.rewards.map((item) => item.resourceId)),
    90,
    601,
    2,
    5,
    91,
  ]
  return [...new Set(ids)].sort((a, b) => a - b)
}

function sourceTotal(result: RewardModelResult, source: keyof RewardModelResult['sources'], resourceId: number): number {
  return result.sources[source][resourceId] ?? 0
}

function distributionValue(
  distribution: RewardDistribution | null,
  result: RewardModelResult,
  resourceId: number,
): { p10: number; median: number; p90: number; mean: number } {
  return distribution?.issuance[resourceId] ?? {
    p10: result.issuance[resourceId] ?? 0,
    median: result.issuance[resourceId] ?? 0,
    p90: result.issuance[resourceId] ?? 0,
    mean: result.issuance[resourceId] ?? 0,
  }
}

function LegacyAuditTable({ audit }: { audit: LegacyRewardAuditResult }) {
  const resourceIds = [...new Set([
    ...Object.keys(audit.freePass.issuance).map(Number),
    ...Object.keys(audit.paidPass.issuance).map(Number),
    ...Object.keys(audit.redPocket.perPlayerTheoretical).map(Number),
    ...Object.keys(audit.redPocket.allSeatCap).map(Number),
  ])].sort((a, b) => a - b)
  return (
    <div className="table-scroll">
      <table className="compact-table" aria-label="旧奖励来源审计">
        <caption>旧配置单次口径（每条来源独立，不相加成统一价值）</caption>
        <thead><tr><th>资源</th><th>免费战令</th><th>付费战令</th><th>红包单人理论</th><th>红包全席上限</th></tr></thead>
        <tbody>{resourceIds.map((resourceId) => <tr key={resourceId}>
          <th scope="row">{rewardResourceLabel(resourceId)} <small>#{resourceId}</small></th>
          <td>{integer(audit.freePass.issuance[resourceId] ?? 0)}</td>
          <td>{integer(audit.paidPass.issuance[resourceId] ?? 0)}</td>
          <td>{integer(audit.redPocket.perPlayerTheoretical[resourceId] ?? 0)}</td>
          <td>{integer(audit.redPocket.allSeatCap[resourceId] ?? 0)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  )
}

export function RewardDashboardPanel({
  scenario,
  season,
  monteCarlo = null,
  stale = false,
  busy = false,
}: {
  scenario: Scenario
  season: SeasonResult
  monteCarlo?: MonteCarloResult | null
  stale?: boolean
  busy?: boolean
}) {
  const [dimension, setDimension] = useState<RewardDimension>('guild')
  const [selectedGuildId, setSelectedGuildId] = useState(scenario.guilds[0]?.id ?? '')
  const config = scenario.rewards
  const result = useMemo(() => calculateRewardModel(scenario, season), [scenario, season])
  const distribution = monteCarlo?.rewards ?? null
  const legacyAudit = useMemo(() => calculateLegacyRewardAudit({ freePassClaims: 1, paidPassClaims: 1, iapPurchases: [] }), [])
  const resourceIds = useMemo(() => {
    const configured = rewardConfigResourceIds(config)
    const issued = Object.keys(result.issuance).map(Number)
    const legacy = Object.keys(legacyAudit.freePass.issuance).map(Number)
    return [...new Set([...configured, ...issued, ...legacy])].sort((a, b) => a - b)
  }, [config, legacyAudit.freePass.issuance, result.issuance])
  const chartLabels = useMemo(
    () => Object.fromEntries(resourceIds.map((resourceId) => [resourceId, REWARD_RESOURCE_LABELS[resourceId] ?? `资源 #${resourceId}`])),
    [resourceIds],
  )
  const chartOption = useMemo(() => buildRewardIssuanceOption(result, chartLabels), [chartLabels, result])
  const selectedGuild = result.guilds[selectedGuildId]
  const eligibleByGuild = useMemo(() => Object.fromEntries(scenario.guilds.map((guild) => [
    guild.id,
    result.players.filter((player) => player.guildId === guild.id && player.rankEligible).length,
  ])), [result.players, scenario.guilds])
  const visiblePlayers = result.players.filter((player) => {
    if (dimension === 'guild') return player.guildId === selectedGuildId
    if (dimension === 'tier') return player.tier === (selectedGuildId as Tier)
    return player.guildId === selectedGuildId
  })
  const completion = distribution?.completionRate.median ?? result.completionRate
  const eligible = distribution?.eligibleCount.median ?? result.eligibleCount
  const changeDimension = (next: RewardDimension) => {
    setDimension(next)
    setSelectedGuildId(next === 'tier' ? 'normal' : scenario.guilds[0]?.id ?? '')
  }

  return (
    <section className="dashboard-card dashboard-card--wide reward-dashboard-panel" aria-labelledby="reward-dashboard-title">
      <header className="card-header">
        <div>
          <p className="eyebrow">SIX-DAY REWARD MODEL</p>
          <h2 id="reward-dashboard-title">六日公会奖励模型</h2>
          <p className="card-subtitle">结算时点：赛季结束 · {config.legacyFreeMode === 'replace' ? '新版免费奖励替换旧免费战令' : '新版免费奖励与旧免费战令叠加'}</p>
        </div>
        <label>查看维度<select aria-label="奖励查看维度" value={dimension} onChange={(event) => changeDimension(event.target.value as RewardDimension)}>
          <option value="guild">公会</option><option value="tier">玩家档位</option><option value="player">玩家明细</option>
        </select></label>
      </header>

      <div className="reward-dashboard__controls">
        <label>公会 / 档位<select aria-label="奖励目标目录" value={selectedGuildId} onChange={(event) => setSelectedGuildId(event.target.value)}>
          {dimension === 'tier'
            ? (Object.keys(TIER_LABELS) as Tier[]).map((tier) => <option key={tier} value={tier}>{TIER_LABELS[tier]}</option>)
            : scenario.guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
        </select></label>
        <span className="reward-settlement-note">奖励到账：赛季结束（不反哺当季战斗）</span>
      </div>

      <div className="result-content" data-stale={String(stale)} aria-busy={busy}>
        <div className="metric-grid reward-metric-grid">
          <article className="metric-card"><span>平均目标达成率</span><strong>{rate(completion)}</strong><small>目标 {integer(config.targetPoints)} 积分</small></article>
          <article className="metric-card"><span>排名资格人数</span><strong>{integer(eligible)}</strong><small>确定性 {integer(result.eligibleCount)} 人</small></article>
          <article className="metric-card"><span>个人奖励档位</span><strong>{config.personalStages.length} 档</strong><small>每日上限 {integer(config.dailyPointCap)} 分</small></article>
          <article className="metric-card metric-card--accent"><span>旧进度审计</span><strong>{integer(config.legacyProgressThreshold)} 分</strong><small>新版目标与旧进度分开</small></article>
        </div>

        <div className="reward-warning-list" role="note" aria-label="奖励口径说明">
          <p>旧战令累计进度 {integer(config.legacyProgressThreshold)} 分不是新版发奖目标；新版按 {integer(config.targetPoints)} 分结算。</p>
          <p>红包成就按终身一次性独立核算；商店兑换是战功回收池，不计入免费发行量。</p>
          <p>资源 601 为聊天称号展示奖励，具体称号 ID 可在排名配置中继续绑定。</p>
        </div>

        <div className="table-scroll">
          <table className="compact-table" aria-label="公会奖励结算">
            <caption>按公会的完成率、里程碑和排名资格</caption>
            <thead><tr><th>公会</th><th>锁定成员</th><th>完成率</th><th>里程碑</th><th>排名</th><th>资格人数</th><th>人均战功</th></tr></thead>
            <tbody>{scenario.guilds.map((guild) => {
              const guildResult = result.guilds[guild.id]
              return <tr key={guild.id}>
                <th scope="row" style={{ color: resolveGuildColors(guild.id).main }}>{guild.name}</th>
                <td>{integer(guildResult?.memberCount ?? 0)}</td>
                <td>{rate(guildResult?.completionRate ?? 0)}</td>
                <td>{guildResult?.milestonesUnlocked ?? 0} / {config.guildMilestones.length}</td>
                <td>{guildResult?.rank ?? '—'}</td>
                <td>{integer(eligibleByGuild[guild.id] ?? 0)}</td>
                <td>{integer(guildResult?.rankMerit ?? 0)}</td>
              </tr>
            })}</tbody>
          </table>
        </div>

        <EChart option={chartOption} label="按资源和来源拆分的奖励发行量" />

        <div className="table-scroll">
          <table className="compact-table" aria-label="奖励发行按资源和来源">
            <caption>新版每资源发行量（资源 ID 保持独立）</caption>
            <thead><tr><th>资源</th><th>个人进度</th><th>公会里程碑</th><th>结算排名</th><th>聊天称号</th><th>旧免费差额</th><th>合计 / P50</th></tr></thead>
            <tbody>{resourceIds.map((resourceId) => {
              const quantiles = distributionValue(distribution, result, resourceId)
              return <tr key={resourceId}>
                <th scope="row">{rewardResourceLabel(resourceId)} <small>#{resourceId}</small></th>
                <td>{integer(sourceTotal(result, 'personal', resourceId))}</td>
                <td>{integer(sourceTotal(result, 'guild', resourceId))}</td>
                <td>{integer(sourceTotal(result, 'rank', resourceId))}</td>
                <td>{integer(sourceTotal(result, 'titles', resourceId))}</td>
                <td className={result.legacyFreeDelta[resourceId] < 0 ? 'capacity-warning' : undefined}>{integer(result.legacyFreeDelta[resourceId] ?? 0)}</td>
                <td>{integer(distribution ? quantiles.median : result.issuance[resourceId] ?? 0)}{distribution ? `（P10 ${integer(quantiles.p10)} / P90 ${integer(quantiles.p90)}）` : ''}</td>
              </tr>
            })}</tbody>
          </table>
        </div>

        <div className="table-pair reward-detail-tables">
          <div className="table-scroll">
            <table className="compact-table" aria-label="个人奖励预览">
              <caption>个人进度奖励预览</caption>
              <thead><tr><th>门槛</th><th>奖励</th></tr></thead>
              <tbody>{config.personalStages.map((stage) => <tr key={stage.points}><th scope="row">{integer(stage.points)} 分</th><td>{formatRewardItems(stage.rewards)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="table-scroll">
            <table className="compact-table" aria-label="公会里程碑预览">
              <caption>公会里程碑与个人门槛</caption>
              <thead><tr><th>完成率</th><th>个人门槛</th><th>奖励</th></tr></thead>
              <tbody>{config.guildMilestones.map((milestone) => <tr key={milestone.completionRate}><th scope="row">{rate(milestone.completionRate)}</th><td>{rate(milestone.minimumPersonalRate)}</td><td>{formatRewardItems(milestone.rewards)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="table-scroll">
          <table className="compact-table" aria-label="玩家奖励明细">
            <caption>玩家奖励明细（{dimension === 'guild' ? (scenario.guilds.find((guild) => guild.id === selectedGuildId)?.name ?? selectedGuildId) : dimension === 'tier' ? TIER_LABELS[selectedGuildId as Tier] : '当前目录'}）</caption>
            <thead><tr><th>玩家</th><th>公会</th><th>档位</th><th>积分</th><th>活跃日</th><th>个人档</th><th>排名资格</th><th>奖励合计</th></tr></thead>
            <tbody>{visiblePlayers.length === 0 ? <tr><td colSpan={8}>当前目录暂无锁定成员。</td></tr> : visiblePlayers.map((player) => <tr key={player.playerId}>
              <th scope="row">{player.playerId}</th><td>{player.guildId}</td><td>{TIER_LABELS[player.tier]}</td><td>{integer(player.points)}</td><td>{player.activeDays}</td><td>{player.personalStagesUnlocked} / {config.personalStages.length}</td><td>{player.rankEligible ? '是' : '否'}</td><td>{Object.entries(player.totalRewards).map(([id, quantity]) => `${rewardResourceLabel(Number(id))} ×${integer(quantity)}`).join('、') || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <LegacyAuditTable audit={legacyAudit} />
        <div className="reward-source-notes">
          <p><strong>旧来源：</strong>免费战令、付费战令、终身红包、IAP 全员礼包分别记账；IAP 有效成员数按输入计算。</p>
          <p><strong>商店：</strong>有限库存成本 {integer(legacyAudit.shop.finiteMeritCost)} 联盟战功，属于资源回收，不进入免费发放；无限兑换不设虚假的总上限。</p>
          <p><strong>当前来源：</strong>{Object.entries(SOURCE_LABELS).map(([key, label]) => `${label} ${integer(Object.values(result.sources[key as keyof typeof result.sources]).reduce((sum, value) => sum + value, 0))}`).join(' · ')}</p>
        </div>
        {dimension !== 'tier' && selectedGuild ? <p className="scope-note">当前选中公会 {selectedGuildId}：完成率 {rate(selectedGuild.completionRate)}，{selectedGuild.milestonesUnlocked} 个里程碑，排名并列占用名次 {selectedGuild.occupiedRanks.join('、') || '—'}。</p> : null}
      </div>
    </section>
  )
}
