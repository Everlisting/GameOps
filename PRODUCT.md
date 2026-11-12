# 游戏运营中台

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

运营与管理员管理活动、稿件、创作者和采集任务；创作者使用独立工作台报名和投稿。

## Product Purpose

集中处理游戏内容运营、数据采集和创作者激励。架构与权限约束见 AGENTS.md 和 docs/architecture.md。

## Capabilities and Constraints

- 活动管理包含「征稿活动」与「专题活动」。征稿活动统一列表，状态通过筛选选择。
- 专题活动按北京时间和标题、达人名单、稿件名单配置自动纳入已采集的视频，采用左图右文的横向卡片，展示稿件、达人、推荐播放量和奖励统计。
- 每个专题可独立配置多个奖池，把筛选、汇总、计奖等步骤组合起来，支持试算、按固定优先级处理互斥和冻结结算。
- 既有征稿业务保留，沿用项目 shadcn 组件与 docs/ui-conventions.md。

## Brand Commitments

GameOps；后台界面克制、专业，沿用现有视觉规范。
