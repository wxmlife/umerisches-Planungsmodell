import type {
  NodeKind,
  Scenario,
  Tier,
  ValidationIssue,
  ValidationResult,
} from './types'

const TIERS: Tier[] = ['normal', 'small', 'whale']
const NODE_KINDS: NodeKind[] = ['normal', 'core', 'center']
const REWARD_RESOURCE_IDS = new Set([2, 3, 5, 10, 19, 62, 63, 64, 90, 91, 92, 93, 140, 601])

function isNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function pushIf(
  issues: ValidationIssue[],
  condition: boolean,
  path: string,
  message: string,
) {
  if (condition) issues.push({ path, message })
}

export function validateScenario(scenario: Scenario): ValidationResult {
  const issues: ValidationIssue[] = []
  const { battle, fans, score, season, simulation, supply } = scenario
  const rewards = scenario.rewards

  pushIf(issues, !isPositiveInteger(fans.capacity), 'fans.capacity', '粉丝池上限必须是正整数')
  pushIf(issues, !isPositiveInteger(fans.minDeploy), 'fans.minDeploy', '单次最低出战必须是正整数')
  pushIf(issues, !isPositiveInteger(fans.maxDeploy), 'fans.maxDeploy', '单次最高出战必须是正整数')
  pushIf(
    issues,
    fans.minDeploy > fans.maxDeploy,
    'fans.minDeploy',
    '单次最低出战不能超过单次最高出战',
  )
  pushIf(
    issues,
    fans.maxDeploy > fans.capacity,
    'fans.maxDeploy',
    '单次最高出战不能超过粉丝池上限',
  )
  pushIf(
    issues,
    !Number.isInteger(fans.formationSlots) || fans.formationSlots < 1 || fans.formationSlots > 999,
    'fans.formationSlots',
    '每人同时编队数必须是 1 到 999 的整数',
  )
  pushIf(
    issues,
    !isNonnegative(fans.naturalCapacityPerDay),
    'fans.naturalCapacityPerDay',
    '自然恢复比例不能为负数',
  )
  pushIf(
    issues,
    !Number.isInteger(fans.attackCooldownMinutes) || fans.attackCooldownMinutes < 0,
    'fans.attackCooldownMinutes',
    '进攻冷却必须是非负整数分钟',
  )
  pushIf(
    issues,
    fans.dailyActionLimit !== null && !isPositiveInteger(fans.dailyActionLimit),
    'fans.dailyActionLimit',
    '每日进攻次数上限必须为空或正整数',
  )

  pushIf(issues, !isNonnegative(battle.alpha), 'battle.alpha', '初始粉丝指数不能为负数')
  pushIf(issues, !isNonnegative(battle.beta), 'battle.beta', '剩余粉丝指数不能为负数')
  pushIf(issues, !(battle.randomMin > 0), 'battle.randomMin', '随机波动下限必须大于 0')
  pushIf(
    issues,
    !(battle.randomMax > battle.randomMin),
    'battle.randomMax',
    '随机波动上限必须大于下限',
  )
  pushIf(issues, !(battle.baseIdolPower > 0), 'battle.baseIdolPower', '基础 IDOL 战力必须大于 0')
  for (const tier of TIERS) {
    pushIf(
      issues,
      !(battle.tierMultipliers[tier] > 0),
      `battle.tierMultipliers.${tier}`,
      '档位战力倍率必须大于 0',
    )
  }
  pushIf(
    issues,
    !isNonnegative(battle.styleAdvantage) || battle.styleAdvantage >= 1,
    'battle.styleAdvantage',
    '风格优势必须在 0（含）到 1（不含）之间',
  )
  pushIf(
    issues,
    !['neutral', 'attacker-advantage', 'attacker-disadvantage'].includes(
      battle.calibrationStyle,
    ),
    'battle.calibrationStyle',
    '校准风格关系无效',
  )
  pushIf(
    issues,
    !isNonnegative(battle.homeLossFactor),
    'battle.homeLossFactor',
    '主场损耗系数不能为负数',
  )
  const bandsMonotonic = battle.lossBands.length > 0
    && battle.lossBands.every((band, index) => (
      isNonnegative(band.minRatio)
      && isNonnegative(band.rate)
      && (index === 0 || battle.lossBands[index - 1].minRatio > band.minRatio)
    ))
    && battle.lossBands.at(-1)?.minRatio === 0
  pushIf(
    issues,
    !bandsMonotonic,
    'battle.lossBands',
    '损耗档位边界必须严格递减、无缺口并以 0 结束',
  )

  const scoreValues = [
    score.attackWinBase,
    score.attackLoss,
    score.holdPerHourBase,
    score.defenderPersonalWinBase,
    score.defenderPersonalLoss,
  ]
  pushIf(issues, scoreValues.some((value) => !isNonnegative(value)), 'score', '积分不能为负数')
  pushIf(
    issues,
    !Number.isInteger(score.defenderPersonalDailyCap) || score.defenderPersonalDailyCap < 0,
    'score.defenderPersonalDailyCap',
    '每日防守贡献次数必须是非负整数',
  )
  for (const kind of NODE_KINDS) {
    pushIf(
      issues,
      !isNonnegative(score.nodeMultipliers[kind]),
      `score.nodeMultipliers.${kind}`,
      '节点倍率不能为负数',
    )
  }

  if (!rewards || typeof rewards !== 'object') {
    issues.push({ path: 'rewards', message: '奖励配置缺失' })
  } else {
    pushIf(issues, !isPositiveInteger(rewards.targetPoints), 'rewards.targetPoints', '奖励目标积分必须是正整数')
    pushIf(issues, !isPositiveInteger(rewards.dailyPointCap), 'rewards.dailyPointCap', '每日奖励积分上限必须是正整数')
    pushIf(issues, rewards.dailyPointCap > rewards.targetPoints, 'rewards.dailyPointCap', '每日奖励积分上限不能超过目标积分')
    pushIf(issues, !isPositiveInteger(rewards.rankMinActiveDays), 'rewards.rankMinActiveDays', '排名最低活跃天数必须是正整数')
    pushIf(issues, !isNonnegative(rewards.rankMinProgressRate) || rewards.rankMinProgressRate > 1, 'rewards.rankMinProgressRate', '排名最低进度比例必须在 0 到 1 之间')
    pushIf(issues, !['replace', 'stack'].includes(rewards.legacyFreeMode), 'rewards.legacyFreeMode', '旧免费奖励处理方式无效')
    let lastPoints = 0
    rewards.personalStages.forEach((stage, index) => {
      pushIf(issues, !isPositiveInteger(stage.points) || stage.points <= lastPoints, `rewards.personalStages.${index}.points`, '个人奖励积分必须严格递增的正整数')
      lastPoints = stage.points
      stage.rewards.forEach((item, itemIndex) => {
        pushIf(issues, !Number.isInteger(item.resourceId) || !REWARD_RESOURCE_IDS.has(item.resourceId), `rewards.personalStages.${index}.rewards.${itemIndex}.resourceId`, '奖励资源 ID 无效')
        pushIf(issues, !isPositiveInteger(item.quantity), `rewards.personalStages.${index}.rewards.${itemIndex}.quantity`, '奖励数量必须是正整数')
      })
    })
    let lastRate = 0
    rewards.guildMilestones.forEach((milestone, index) => {
      const rateValid = isNonnegative(milestone.completionRate) && milestone.completionRate > lastRate && milestone.completionRate <= 1
      pushIf(issues, !rateValid, `rewards.guildMilestones.${index}.completionRate`, '公会里程碑完成率必须严格递增且不超过 1')
      pushIf(issues, !isNonnegative(milestone.minimumPersonalRate) || milestone.minimumPersonalRate > milestone.completionRate, `rewards.guildMilestones.${index}.minimumPersonalRate`, '里程碑个人门槛无效')
      if (rateValid) lastRate = milestone.completionRate
      milestone.rewards.forEach((item, itemIndex) => {
        pushIf(issues, !Number.isInteger(item.resourceId) || !REWARD_RESOURCE_IDS.has(item.resourceId), `rewards.guildMilestones.${index}.rewards.${itemIndex}.resourceId`, '奖励资源 ID 无效')
        pushIf(issues, !isPositiveInteger(item.quantity), `rewards.guildMilestones.${index}.rewards.${itemIndex}.quantity`, '奖励数量必须是正整数')
      })
    })
    const rankSet = new Set<number>()
    rewards.rankRewards.forEach((rank, index) => {
      pushIf(issues, !isPositiveInteger(rank.rank) || rankSet.has(rank.rank), `rewards.rankRewards.${index}.rank`, '排名必须是唯一正整数')
      rankSet.add(rank.rank)
      pushIf(issues, !Number.isInteger(rank.merit) || rank.merit < 0, `rewards.rankRewards.${index}.merit`, '排名战功必须是非负整数')
      pushIf(issues, rank.titleId !== null && !isPositiveInteger(rank.titleId), `rewards.rankRewards.${index}.titleId`, '称号 ID 必须为空或正整数')
      pushIf(issues, rank.titleLabel.trim().length === 0, `rewards.rankRewards.${index}.titleLabel`, '称号标签不能为空')
    })
    pushIf(issues, !isPositiveInteger(rewards.legacyProgressThreshold), 'rewards.legacyProgressThreshold', '旧进度审计值必须是正整数')
  }

  const offerIds = new Set<string>()
  supply.offers.forEach((offer, index) => {
    const basePath = `supply.offers.${index}`
    pushIf(issues, offer.id.trim().length === 0, `${basePath}.id`, '补给 ID 不能为空')
    pushIf(issues, offerIds.has(offer.id), `${basePath}.id`, '补给 ID 不能重复')
    offerIds.add(offer.id)
    const numericFields = [
      ['usdCost', offer.usdCost],
      ['diamondCost', offer.diamondCost],
      ['adCost', offer.adCost],
      ['immediateCapacityRate', offer.immediateCapacityRate],
      ['continuousCapacityRate', offer.continuousCapacityRate],
    ] as const
    for (const [field, value] of numericFields) {
      pushIf(
        issues,
        !isNonnegative(value),
        `${basePath}.${field}`,
        '价格和恢复比例不能为负数',
      )
    }
    pushIf(
      issues,
      !Number.isInteger(offer.durationMinutes) || offer.durationMinutes < 0,
      `${basePath}.durationMinutes`,
      '持续时间必须是非负整数',
    )
    pushIf(
      issues,
      !Number.isInteger(offer.fixedFans) || offer.fixedFans < 0,
      `${basePath}.fixedFans`,
      '固定粉丝数必须是非负整数',
    )
    pushIf(
      issues,
      offer.dailyPurchaseLimit !== null && !isPositiveInteger(offer.dailyPurchaseLimit),
      `${basePath}.dailyPurchaseLimit`,
      '每日限购必须为空或正整数',
    )
    offer.pulseCapacityRates.forEach((pulse, pulseIndex) => {
      pushIf(
        issues,
        !Number.isInteger(pulse.afterMinutes) || pulse.afterMinutes < 0 || !isNonnegative(pulse.rate),
        !Number.isInteger(pulse.afterMinutes) || pulse.afterMinutes < 0
          ? `${basePath}.pulseCapacityRates.${pulseIndex}.afterMinutes`
          : `${basePath}.pulseCapacityRates.${pulseIndex}.rate`,
        '脉冲时间必须是非负整数且恢复比例不能为负数',
      )
    })
  })
  pushIf(
    issues,
    !Number.isInteger(supply.adDailyLimit) || supply.adDailyLimit < 0,
    'supply.adDailyLimit',
    '每日广告上限必须是非负整数',
  )
  pushIf(
    issues,
    supply.diamondUsdRate !== null && !isNonnegative(supply.diamondUsdRate),
    'supply.diamondUsdRate',
    '钻石单价不能为负数',
  )

  pushIf(issues, !isPositiveInteger(season.days), 'season.days', '战斗日必须是正整数')
  pushIf(
    issues,
    !isPositiveInteger(season.centerUnlockDay) || season.centerUnlockDay > season.days,
    'season.centerUnlockDay',
    '中心节点开放日必须在赛季范围内',
  )
  for (const kind of NODE_KINDS) {
    pushIf(
      issues,
      !Number.isInteger(season.nodeCounts[kind]) || season.nodeCounts[kind] < 0,
      `season.nodeCounts.${kind}`,
      '节点数必须是非负整数',
    )
  }

  const guildIds = new Set<string>()
  scenario.guilds.forEach((guild, index) => {
    const basePath = `guilds.${index}`
    pushIf(issues, guild.id.trim().length === 0, `${basePath}.id`, '公会 ID 不能为空')
    pushIf(issues, guildIds.has(guild.id), `${basePath}.id`, '公会 ID 不能重复')
    guildIds.add(guild.id)
    for (const tier of TIERS) {
      const policy = guild.purchasePolicies[tier]
      const policyPath = `${basePath}.purchasePolicies.${tier}`
      pushIf(
        issues,
        !isNonnegative(policy.versionUsdBudget),
        `${policyPath}.versionUsdBudget`,
        '版本现金预算必须是有限非负数',
      )
      for (const field of ['versionDiamondBudget', 'versionAdBudget'] as const) {
        pushIf(
          issues,
          !Number.isInteger(policy[field]) || policy[field] < 0,
          `${policyPath}.${field}`,
          '版本钻石和广告预算必须是非负整数',
        )
      }
      policy.supplyPriority.forEach((offerId, priorityIndex) => {
        pushIf(
          issues,
          !offerIds.has(offerId),
          `${policyPath}.supplyPriority.${priorityIndex}`,
          '补给优先级引用了不存在的补给',
        )
      })
      pushIf(
        issues,
        new Set(policy.supplyPriority).size !== policy.supplyPriority.length,
        `${policyPath}.supplyPriority`,
        '补给优先级不能重复',
      )
      pushIf(
        issues,
        !Number.isInteger(guild.roster[tier]) || guild.roster[tier] < 0,
        `${basePath}.roster.${tier}`,
        '成员数必须是非负整数',
      )
    }
    for (const kind of NODE_KINDS) {
      const deployment = guild.deployFans[kind]
      pushIf(
        issues,
        !Number.isInteger(deployment) || deployment < fans.minDeploy || deployment > fans.maxDeploy,
        `${basePath}.deployFans.${kind}`,
        '出战粉丝必须是当前上下限内的整数',
      )
      pushIf(
        issues,
        !isNonnegative(guild.priorities[kind]),
        `${basePath}.priorities.${kind}`,
        '节点优先级不能为负数',
      )
    }
    pushIf(
      issues,
      NODE_KINDS.every((kind) => guild.priorities[kind] === 0),
      `${basePath}.priorities`,
      '同一公会至少需要一个正数节点优先级',
    )
  })

  pushIf(issues, !isPositiveInteger(simulation.runs), 'simulation.runs', '模拟次数必须是正整数')
  pushIf(issues, !Number.isInteger(simulation.seed), 'simulation.seed', '随机种子必须是整数')
  pushIf(
    issues,
    !isPositiveInteger(simulation.maxEventsPerDay),
    'simulation.maxEventsPerDay',
    '单日最大事件数必须是正整数',
  )

  return { valid: issues.length === 0, issues }
}
