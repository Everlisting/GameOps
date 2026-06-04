/**
 * 激励规则种类的中文标签。
 * 运营端 / 创作者端展示 breakdown 时统一从这里取。
 */
import type { RewardRule } from "@/lib/validation/activity";

export const REWARD_KIND_LABEL: Record<RewardRule["kind"], string> = {
  TIER: "阶梯档位",
  FORMULA: "自定义奖池",
  SHARE_POOL: "占比瓜分",
  RANK: "排名奖",
  PER_SUBMISSION: "单条稿件",
  ACTIVITY_THRESHOLD: "活动总数据",
  BASE_PLUS_STEP: "基础+步进",
};
