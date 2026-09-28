import type { Scenario, Tier, ValidationResult } from '../domain/types'
import type { SimulatorAnalysis } from '../state/simulatorReducer'
import { CollapsibleSection } from './CollapsibleSection'
import { NumberSlider } from './NumberSlider'

export interface ParameterSidebarProps {
  scenario: Scenario
  validation: ValidationResult
  analysis?: SimulatorAnalysis
  onSetNumber: (path: string, value: number) => void
  onSetNullableNumber?: (path: string, value: number | null) => void
  onSetAnalysisNumber?: (path: string, value: number) => void
  onSetAnalysisChoice?: (path: 'targetGuildId' | 'targetTier', value: string) => void
}

const TIER_LABELS: Record<Tier, string> = {
  normal: '普通',
  small: '小 R',
  whale: '大 R',
}

export function ParameterSidebar({
  scenario,
  validation,
  analysis,
  onSetNumber,
  onSetNullableNumber,
  onSetAnalysisNumber,
  onSetAnalysisChoice,
}: ParameterSidebarProps) {
  const errorFor = (path: string) => validation.issues.find(
    (issue) => issue.path === path,
  )?.message
  const control = (
    path: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
  ) => (
    <NumberSlider
      key={path}
      path={path}
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      error={errorFor(path)}
      onChange={onSetNumber}
    />
  )

  return (
    <aside className="parameter-sidebar" aria-label="模拟参数">
      <header className="parameter-sidebar__header">
        <p className="eyebrow">ALLIANCE WAR LAB</p>
        <h1>公会战数值模拟器</h1>
      </header>

      <CollapsibleSection title="战斗" defaultOpen>
        {control('battle.baseIdolPower', '普通玩家五人原始战力', scenario.battle.baseIdolPower, 1, 2_000_000, 1000)}
        {control('battle.tierMultipliers.normal', '普通档战力倍率', scenario.battle.tierMultipliers.normal, 0.1, 20, 0.1)}
        {control('battle.tierMultipliers.small', '小 R 战力倍率', scenario.battle.tierMultipliers.small, 0.1, 20, 0.1)}
        {control('battle.tierMultipliers.whale', '大 R 战力倍率', scenario.battle.tierMultipliers.whale, 0.1, 20, 0.1)}
        {control('battle.alpha', '初始粉丝指数 α', scenario.battle.alpha, 0, 4, 0.01)}
        {control('battle.beta', '剩余粉丝指数 β', scenario.battle.beta, 0, 5, 0.01)}
        {control('battle.styleAdvantage', '风格优势比例', scenario.battle.styleAdvantage, 0, 0.5, 0.01)}
        {control('battle.randomMin', '随机波动下限', scenario.battle.randomMin, 0.1, 2, 0.01)}
        {control('battle.randomMax', '随机波动上限', scenario.battle.randomMax, 0.1, 2, 0.01)}
      </CollapsibleSection>

      <CollapsibleSection title="损耗">
        {scenario.battle.lossBands.map((band, index) => control(
          `battle.lossBands.${index}.rate`,
          `战力比 ≥ ${band.minRatio} 损耗率`,
          band.rate,
          0,
          1,
          0.01,
        ))}
        {control('battle.homeLossFactor', '主场损耗系数', scenario.battle.homeLossFactor, 0, 2, 0.01)}
      </CollapsibleSection>

      <CollapsibleSection title="粉丝" defaultOpen>
        {control('fans.capacity', '粉丝池上限', scenario.fans.capacity, 100, 20_000, 100)}
        {control('fans.minDeploy', '单次最低出战', scenario.fans.minDeploy, 1, 20_000, 100)}
        {control('fans.maxDeploy', '单次最高出战', scenario.fans.maxDeploy, 1, 20_000, 100)}
        {control('fans.naturalCapacityPerDay', '每日自然恢复容量比例', scenario.fans.naturalCapacityPerDay, 0, 4, 0.01)}
        {control('fans.attackCooldownMinutes', '进攻冷却（分钟）', scenario.fans.attackCooldownMinutes, 0, 240, 1)}
        {control('fans.formationSlots', '每人同时编队数', scenario.fans.formationSlots, 1, 999, 1)}
        {control('fans.dailyActionLimit', '每日进攻上限（0=关闭）', scenario.fans.dailyActionLimit ?? 0, 0, 100, 1)}
      </CollapsibleSection>

      <CollapsibleSection title="地图与积分">
        {control('season.days', '赛季战斗日', scenario.season.days, 1, 14, 1)}
        {control('season.nodeCounts.normal', '普通节点数', scenario.season.nodeCounts.normal, 0, 100, 1)}
        {control('season.nodeCounts.core', '核心节点数', scenario.season.nodeCounts.core, 0, 50, 1)}
        {control('season.nodeCounts.center', '中心节点数', scenario.season.nodeCounts.center, 0, 10, 1)}
        {control('season.centerUnlockDay', '中心开放日', scenario.season.centerUnlockDay, 1, scenario.season.days, 1)}
        {control('score.attackWinBase', '进攻获胜基础分', scenario.score.attackWinBase, 0, 100, 1)}
        {control('score.attackLoss', '进攻失败分', scenario.score.attackLoss, 0, 30, 1)}
        {control('score.holdPerHourBase', '每小时占领基础分', scenario.score.holdPerHourBase, 0, 10, 0.1)}
        {control('score.nodeMultipliers.normal', '普通节点倍率', scenario.score.nodeMultipliers.normal, 0, 10, 0.1)}
        {control('score.nodeMultipliers.core', '核心节点倍率', scenario.score.nodeMultipliers.core, 0, 10, 0.1)}
        {control('score.nodeMultipliers.center', '中心节点倍率', scenario.score.nodeMultipliers.center, 0, 10, 0.1)}
      </CollapsibleSection>

      <CollapsibleSection title="公会">
        {scenario.guilds.map((guild, guildIndex) => (
          <fieldset key={guild.id} className="parameter-subgroup">
            <legend>{guild.name}</legend>
            {(Object.keys(TIER_LABELS) as Tier[]).map((tier) => control(
              `guilds.${guildIndex}.roster.${tier}`,
              `${guild.name} ${TIER_LABELS[tier]}成员数`,
              guild.roster[tier],
              0,
              100,
              1,
            ))}
            {(['normal', 'core', 'center'] as const).flatMap((kind) => [
              control(
                `guilds.${guildIndex}.deployFans.${kind}`,
                `${guild.name} ${kind}出战粉丝`,
                guild.deployFans[kind],
                scenario.fans.minDeploy,
                scenario.fans.maxDeploy,
                100,
              ),
              control(
                `guilds.${guildIndex}.priorities.${kind}`,
                `${guild.name} ${kind}优先级`,
                guild.priorities[kind],
                0,
                10,
                0.1,
              ),
            ])}
          </fieldset>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="商城">
        {control('supply.adDailyLimit', '每日奖励广告上限', scenario.supply.adDailyLimit, 0, 30, 1)}
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={scenario.supply.diamondUsdRate !== null}
            onChange={(event) => onSetNullableNumber?.(
              'supply.diamondUsdRate',
              event.target.checked ? 0.01 : null,
            )}
          />
          启用钻石美元单价
        </label>
        {scenario.supply.diamondUsdRate !== null
          ? control('supply.diamondUsdRate', '单钻美元价值', scenario.supply.diamondUsdRate, 0, 10, 0.001)
          : null}
        {scenario.supply.offers.map((offer, offerIndex) => (
          <fieldset key={offer.id} className="parameter-subgroup">
            <legend>{offer.label}</legend>
            {control(`supply.offers.${offerIndex}.usdCost`, `${offer.label} 美元价格`, offer.usdCost, 0, 100, 0.01)}
            {control(`supply.offers.${offerIndex}.diamondCost`, `${offer.label} 钻石价格`, offer.diamondCost, 0, 10_000, 1)}
            {control(`supply.offers.${offerIndex}.adCost`, `${offer.label} 广告次数`, offer.adCost, 0, 10, 1)}
            {control(`supply.offers.${offerIndex}.dailyPurchaseLimit`, `${offer.label} 每日限购（0=不限）`, offer.dailyPurchaseLimit ?? 0, 0, 100, 1)}
          </fieldset>
        ))}
        {(Object.keys(TIER_LABELS) as Tier[]).map((tier) => (
          <fieldset key={tier} className="parameter-subgroup">
            <legend>{TIER_LABELS[tier]}购买策略</legend>
            {control(`supply.purchasePolicies.${tier}.dailyUsdBudget`, `${TIER_LABELS[tier]}每日美元预算`, scenario.supply.purchasePolicies[tier].dailyUsdBudget, 0, 1000, 1)}
            {control(`supply.purchasePolicies.${tier}.dailyDiamondBudget`, `${TIER_LABELS[tier]}每日钻石预算`, scenario.supply.purchasePolicies[tier].dailyDiamondBudget, 0, 100_000, 10)}
          </fieldset>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="模拟" defaultOpen>
        {control('simulation.runs', '蒙特卡洛次数', scenario.simulation.runs, 1, 10_000, 10)}
        {control('simulation.seed', '随机种子', scenario.simulation.seed, 0, 99_999_999, 1)}
        {control('simulation.maxEventsPerDay', '单日最大事件数', scenario.simulation.maxEventsPerDay, 100, 1_000_000, 100)}
        {analysis ? (
          <>
            <label className="select-control">
              目标公会
              <select
                value={analysis.targetGuildId}
                onChange={(event) => onSetAnalysisChoice?.('targetGuildId', event.target.value)}
              >
                {scenario.guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
              </select>
            </label>
            <label className="select-control">
              目标玩家档位
              <select
                value={analysis.targetTier}
                onChange={(event) => onSetAnalysisChoice?.('targetTier', event.target.value)}
              >
                {(Object.keys(TIER_LABELS) as Tier[]).map((tier) => (
                  <option key={tier} value={tier}>{TIER_LABELS[tier]}</option>
                ))}
              </select>
            </label>
            <NumberSlider path="targetNodes.normal" label="目标普通节点" value={analysis.targetNodes.normal} min={0} max={100} step={1} onChange={(path, value) => onSetAnalysisNumber?.(path, value)} />
            <NumberSlider path="targetNodes.core" label="目标核心节点" value={analysis.targetNodes.core} min={0} max={50} step={1} onChange={(path, value) => onSetAnalysisNumber?.(path, value)} />
            <NumberSlider path="targetNodes.center" label="目标中心节点" value={analysis.targetNodes.center} min={0} max={10} step={1} onChange={(path, value) => onSetAnalysisNumber?.(path, value)} />
            <NumberSlider path="sweepMin" label="预算扫描最小值" value={analysis.sweepMin} min={0} max={1000} step={1} onChange={(path, value) => onSetAnalysisNumber?.(path, value)} />
            <NumberSlider path="sweepMax" label="预算扫描最大值" value={analysis.sweepMax} min={0} max={1000} step={1} onChange={(path, value) => onSetAnalysisNumber?.(path, value)} />
            <NumberSlider path="sweepStep" label="预算扫描步长" value={analysis.sweepStep} min={0.01} max={1000} step={0.01} onChange={(path, value) => onSetAnalysisNumber?.(path, value)} />
          </>
        ) : null}
      </CollapsibleSection>
    </aside>
  )
}
