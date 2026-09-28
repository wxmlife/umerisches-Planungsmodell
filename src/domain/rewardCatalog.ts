import type { RewardItem, RewardResourceId } from './types'

/** Resource names are deliberately kept beside the reward model so every
 * dashboard surface uses the same ID vocabulary. Unknown IDs remain visible.
 */
export const REWARD_RESOURCE_LABELS: Record<number, string> = {
  2: '钻石',
  3: '金币',
  5: '公司升级券',
  10: '卡券',
  19: 'SSR 万能碎片',
  62: 'R 经验书',
  63: 'SR 经验书',
  64: 'SSR 经验书',
  90: '联盟战功',
  91: '联盟贡献',
  92: '联盟能量饮料',
  93: '联盟礼包',
  94: '联盟积分点数（进度）',
  140: '觉醒书',
  601: '聊天称号',
}

export function rewardResourceLabel(resourceId: RewardResourceId): string {
  return REWARD_RESOURCE_LABELS[resourceId] ?? `资源 #${resourceId}`
}

export function formatRewardItems(items: RewardItem[]): string {
  return items.map((item) => `${rewardResourceLabel(item.resourceId)} ×${item.quantity.toLocaleString('zh-CN')}`).join('、')
}

