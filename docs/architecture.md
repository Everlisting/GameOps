# 游戏运营中台 — 架构设计文档

> 依据 2026-11-23 工作区实现整理。数据模型以 [Prisma Schema](../prisma/schema.prisma) 为准。

---

## 1. 项目概述

服务于游戏运营的中台网站,面向四类用户提供差异化功能。核心特征:

- **多角色分流**:登录后按角色跳转到不同工作台。
- **内容运营闭环**:创作者投稿 → 运营审核管理 → 活动激励结算。
- **分布式数据采集**:多台本地 Windows 爬虫机执行 Python 爬虫,CSV 回传中台入库。
- **数据可视化与外发**:BI 大屏按页面请求或手动刷新,每日汇总数据推送飞书群。

---

## 2. 用户角色与权限

后台角色为**层级关系**,高层级包含低层级权限,创作者独立对外。

| 角色 | 入口 | 核心功能 |
|------|------|----------|
| 创作者 Creator | 创作者工作台 | 参与活动、投稿、查看预估激励、个人数据 |
| 审核 Reviewer | 稿件审核工作台 | 查看本人分配的周期与视频、逐条审核、个人账户设置 |
| 运营 Operator | 运营后台 | BI 大屏、稿件管理、创作者管理、活动管理、启动爬虫任务 |
| 管理员 Admin | 运营后台 + 管理面板 | 运营全部功能 + 爬虫任务管理 + 机器管理 + 用户权限管理 |

权限层级:`Admin ⊃ Operator ⊃ Reviewer`,Creator 为独立的对外角色。审核角色登录后进入 `/operator/submissions`,只显示稿件管理菜单,易闪导入、创作者管理、活动/数据/爬虫/AI 助手及管理面板均需更高权限。管理员在运营账户管理中创建、编辑和筛选审核账户。

角色与首页映射集中在 Edge 安全的 `lib/roles.ts`。后台会话从数据库读取最新角色以应用升降级;middleware 覆盖 `x-operator-pathname`,布局据此限制审核用户的页面范围,每个页面与接口仍独立校验权限,防止客户端导航复用布局或旧 JWT 绕过校验。

**实现**:RBAC。用户表带 `role`;中间件按"所需最低角色"判断(接口要求 Operator,则 Operator 与 Admin 均通过)。后续权限若需细化,再平滑升级为"角色-权限点"模型,初期不过度设计。

**登录**:账密自建。密码 argon2 哈希;会话用 JWT(httpOnly cookie)。创作者与运营**共用登录入口**,按 `role` 跳转不同首页。

后台账户分为「用户名」与「账号名称」:数据库 `User.displayName` 为可修改的显示昵称(1–32 字符,支持中文、不要求唯一),`User.username` 为账号名称(3–32 位字母、数字、下划线、点或短横线,全局唯一、创建后不可修改)。管理员创建时填写两者,本人可在 `/operator/account` 修改用户名。旧账户未设置昵称时显示账号名称。运营会话从数据库读取最新昵称;登录、审计快照仍使用固定账号名称,外键仍用 `User.id`。创作者的用户名与 `Creator.nickname` 行为保持原样。

---

## 3. 技术选型

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | Next.js 14 (App Router) + React + TS | 创作者端与运营端按路由分组隔离 |
| UI/样式 | Tailwind CSS + shadcn/ui | 运营后台表格/表单密集,组件库提效 |
| 图表/大屏 | Recharts | 作品发布趋势、播放变化与审核分布 |
| 后端 | Next.js Route Handlers + Node | 一体化;调度逻辑可后续拆独立服务 |
| 数据库 | PostgreSQL + Prisma | 数据量小(总量约 10w),关系型足够 |
| 采集队列 | PostgreSQL | Agent 从 CrawlerTask 领取任务 |
| 校验 | Zod | API 入参 + CSV 行校验 |
| 鉴权 | 自建(argon2 + JWT) | 账密登录 |
| 测试 | Vitest + Playwright | 单元/集成 + E2E |
| 爬虫端 | Python(Agent + 爬虫) | 后续统一 Python |
| 外发 | 飞书群自定义机器人 webhook | 推送汇总消息/表格卡片 |
| 中台部署 | 阿里云服务器 | 常驻 Node 环境 |
| 爬虫机 | 本地 Windows(内网) | 出站访问中台即可 |

---

## 4. 系统整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器 (用户)                          │
│   创作者工作台   │   运营后台   │   管理员面板               │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────┐
│           中台 (Next.js + Node) — 阿里云                   │
│  ┌──────────┬──────────┬──────────┬───────────────────┐  │
│  │ 认证/RBAC │ 业务 API  │ BI 聚合   │ 爬虫调度 API       │  │
│  └──────────┴──────────┴──────────┴───────────────────┘  │
│  ┌─────────────┐   ┌─────────────┐   ┌────────────────┐  │
│  │ PostgreSQL  │   │  采集任务队列 │   │ 飞书 webhook    │──┼──> 飞书群
│  └─────────────┘   └─────────────┘   └────────────────┘  │
└───────────────────────▲─────────────────────────────────┘
                        │ 出站轮询 / 回传 (HTTPS)  ※单向
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼───────┐ ┌─────▼────────┐
│ 本地 Win 机#1 │ │ 本地 Win 机#2 │ │ 本地 Win 机#N │
│ Py Agent +   │ │ Py Agent +   │ │ Py Agent +   │
│ Python 爬虫   │ │ Python 爬虫   │ │ Python 爬虫   │
└──────────────┘ └──────────────┘ └──────────────┘
```

**网络关键点**:中台在阿里云(公网),爬虫机在本地内网。通信完全**单向出站**——爬虫机访问中台,中台无需也无法主动连爬虫机。拉模型恰好契合。开发期 Agent 指向 `localhost:3000`,上线只改中台地址配置。

---

## 5. 模块划分

### 5.1 创作者端
创作者在工作台报名、投稿并查看预估激励。公开素材库 `/inspirations` 与工作台共用查询和浏览组件，仅展示已发布资源。见[创作灵感](inspirations.md)。

### 5.2 运营端
运营概览汇总项目、稿件、活动、舆情。运营按周期分配视频，审核结果写入 `VideoStat`，独立于征稿记录 `Submission`。专题活动从视频库匹配作品，计奖读取审核结果。见[稿件管理](submissions-design.md)与[专题结算](special-activities.md)。

### 5.3 管理员端(运营端之上)
爬虫任务管理(定义/绑定机器/调度/历史日志)、机器管理(心跳/在线状态)、用户与权限管理。

### 5.4 Python Agent 端(每台 Windows 机)
轮询领任务 → 调用本机 Python 爬虫 → 回传 CSV 与状态 → 定期心跳。与中台仅通过 HTTP 协议通信,语言独立。

---

## 6. 关键设计

### 6.1 爬虫通信:Jenkins 风格的 Job/Task 分离(2026-06 重构)

**模型**:Job 是模板,Task 是单次执行。Job 显式绑定 1 台 Agent;同 Agent **并发 = 1**。

状态机(`CrawlerTaskStatus`):

```
PENDING ──claim──▶ RUNNING ──result(success)──▶ SUCCEEDED
                       │
                       └──result(failure) ─────▶ FAILED ──rerun──▶ 新 task PENDING
                                                       └──requeue──▶ PENDING(同 task)
任何状态(非终态) ──取消──▶ CANCELED ──rerun/requeue──▶ PENDING
```

**没有自动重试边**;失败需要人工 rerun(克隆新 task)或 requeue(重置同 task)。

| 接口 | 方法 | 作用 |
|------|------|------|
| `/api/agent/heartbeat` | POST | 心跳,1 分钟一次,中台判 10 分钟无心跳为离线 |
| `/api/agent/tasks/claim` | POST | 原子领任务(SKIP LOCKED + NOT EXISTS 保证并发=1) |
| `/api/agent/tasks/<id>/prepare` | POST | 执行前记录实际源码版本和执行环境，与建任务时保存的模板快照配合，供重跑复现 |
| `/api/agent/tasks/<id>/log` | POST | 流式推子进程输出;同时作为**取消信号通道**(4xx 视为取消) |
| `/api/agent/tasks/<id>/result` | POST | multipart 上传:status + files + csvTypes(可含 null) |

鉴权:Bearer `<agentId>.<secret>`,中台 argon2 哈希存储。
取消:`PATCH /api/admin/tasks/<id> status=CANCELED` → 日志页追加 marker → agent watchdog 收到 4xx → 5s 内 kill 子进程。
完整契约见 `docs/agent-protocol.md`。

### 6.1.1 审计日志

`task.trigger / cancel / requeue / rerun / priority` 五种关键动作各写一条 `AuditLog`:

```prisma
model AuditLog {
  actorId       String?    // null = 系统(cron)
  actorUsername String     // 快照,删用户后仍可读
  action        String     // task.trigger / task.cancel / ...
  targetType    String     // task / job / agent
  targetId      String?
  details       Json?      // paramValues / fromStatus / 字段 diff 等
  createdAt     DateTime
}
```

阶段 8 接管理员审计查看页。

### 6.1.2 时区策略

**问题**:PG `timestamp without time zone` + Prisma `new Date()` 的混合行为依赖 session timezone,容易写偏 8 小时。

**统一约束**:
- PG 数据库 `ALTER DATABASE gameops SET timezone TO 'UTC'`
- Prisma 走默认行为(ISO + Z),裸值即 UTC
- raw SQL 写时间戳用 `(NOW() AT TIME ZONE 'UTC')` 显式 UTC
- 前端 `lib/format.ts` 用 `Intl.DateTimeFormat({ timeZone: "Asia/Shanghai" })` 渲染

任何时间字段往 DB 写之前都是 UTC 瞬时点;往 UI 展示之前都按 Asia/Shanghai 换算。中间链路不做转换。

### 6.2 CSV 入库:代码内定义映射(三层数据策略)

CSV 多、表与 CSV 非一一对应(有汇总取舍)。映射关系**写在代码内**(放弃可视化建表),数据分三层:

1. 原始文件按产物类型留底，`RawDataset` 记录来源、文件位置及解析结果。
2. `lib/parsers/` 按 csvType 解析，更新视频、主播或直播明细。视频采集保留人工审核结果。
3. `DailyVideoStat` 保存视频按日快照，供 BI 比较同一作品前后两天的播放量。

### 6.3 飞书同步

管理员配置接收日报的群机器人和日报内容。飞书应用的群聊与双向消息使用长连接，见[飞书连接配置](feishu-ws-hot-reload.md)。

### 6.4 BI 统计

大屏按北京时间的作品发布日期选取有效视频。累计播放量取所选作品的最新值，每日播放变化只比较相邻两日都有快照的作品。按页面请求读取，支持手动刷新。日期边界、审核指标与排行见 [BI 统计口径](bi-dashboard-design.md)。

### 6.5 预估激励:组合规则引擎(半自动) — 阶段 5 已落地

**七类规则块**(`Activity.rewardRules` 数组,可叠加,最多 10 条;Zod 校验见 `lib/validation/activity.ts`):

| kind | 语义 | 关键字段 |
|------|------|----------|
| `TIER` | 阶梯档位 | `metric` + `tiers[{min,max?,amount}]` |
| `FORMULA` | 自定义奖池 | `tokens[]` 积木(metric/number/op),引擎按顺序串成表达式求值 |
| `SHARE_POOL` | 占比瓜分 | `pool` + `weightField` + 可选 `topN` |
| `RANK` | 排名奖 | `metric` + `ranks[{from,to,amount}]` 区间 |
| `PER_SUBMISSION` | 单条稿件 | `amount` × 条数,可选 `approvedOnly` / `minViews` 过滤 |
| `ACTIVITY_THRESHOLD` | 活动总数据达标 | `metric` ≥ `threshold` 时给 `amount` |
| `BASE_PLUS_STEP` | 基础+步进 | 达 `baseThreshold` 给 `baseAmount`,再按 `stepSize` 每步加 `stepAmount` |

每条规则可挂两个上限:
- `cap`(元):金额硬上限。
- `cpmCap`(元/千播放):换算到金额上限 = `cpmCap × views / 1000`;创作者 `views=0`(无回流数据)时不生效。

**引擎**(`lib/incentive/engine.ts`):纯函数,输入 `RewardRule[]` + `CreatorMetrics[]`,输出 `Map<creatorId, { estimated, breakdown }>`。规则相互独立,各自完成 cap/cpmCap 截断;`breakdown` 留每条贡献明细(命中档位 / 排名 / 占比),UI 展开看「为什么算出这个数」。配套单测 `engine.test.ts`。

**聚合层**(`lib/incentive/aggregate.ts`):候选 = 该活动「报名 ∪ 投稿」并集。指标按创作者维度从已通过 + 抖音 + 有 externalId 的稿件 join `VideoStat` 加总。`submissionViews` 数组喂 `PER_SUBMISSION.minViews/approvedOnly` 过滤。

**结果落表**(`Incentive`,见第 7 节 schema):每个 `(creatorId, activityId)` 一行;
- 运营触发 `POST /api/operator/activities/[id]/incentives/compute` → upsert,仅刷新 `estimated/breakdown/computedAt`,**保留** 人工 `adjusted/adjustedBy/adjustReason`。
- 单条调整 `PATCH /api/operator/incentives/[id]` → 写 `adjusted`(传 null 撤销);结算口径:`adjusted ?? estimated`。
- 审计动作:`incentive.compute`(全活动)/ `incentive.adjust`(单条),`AuditAction` 已收录。

**UI**:
- 运营端活动详情页 `IncentiveSection`:重算按钮 + 创作者明细表(展开 breakdown / 调整对话框),折叠状态持久化到 localStorage(`hooks/use-persistent-toggle.ts`)。
- 创作者端 `dashboard` 与活动详情:展示「预估激励」卡片,注明最终以结算为准。
- 规则编辑器 `RewardRulesEditor` 七类规则的表单 UI,不做可视化拖拽。

---

## 7. 数据模型

| 业务 | 主要模型与关系 |
| --- | --- |
| 征稿活动 | `Activity` 关联报名、`Submission` 投稿与每位创作者的 `Incentive` |
| 视频审核 | `SubmissionPeriod` 按日期定义统计范围；`VideoReviewAssignment` 按视频唯一分配。实际审核人、结果和审核时间保存在 `VideoStat`，标签引用 `ReviewTag`，修改记录写入 `AuditLog` |
| 专题活动 | `SpecialActivity` 按规则匹配有效视频；确认结算时保存配置、审核结果与计奖快照 |
| 创作灵感 | `Inspiration.files` 保存有序附件，首项同步主链接，旧单链接资源继续可读 |

字段、索引与唯一约束见 [Prisma Schema](../prisma/schema.prisma)，变更历史见 [migrations](../prisma/migrations)。

## 8. 部署与网络

中台在阿里云 ECS 以 PM2 单实例运行，Nginx 提供 HTTPS，业务数据保存在 PostgreSQL。进程内调度器和后台任务随中台启动。Windows 采集机通过计划任务运行 Agent，主动出站领取任务。首次部署、上传限制与持久化目录见[阿里云部署指南](deploy-aliyun-guide.html)。

## 附:已放弃/简化的方案(记录决策)

- ❌ 可视化建表(运营网页定义表与汇总规则):复杂度过高,改为**代码内定义映射**。
- ❌ 中台直连爬虫机的推模型:改为 **Agent 拉模型**(适配内网)。
- 飞书通知仍使用**群自定义机器人 webhook**；双向对话另使用开放平台自建应用长连接，
  凭证切换方案见 [`docs/feishu-ws-hot-reload.md`](./feishu-ws-hot-reload.md)。
- ❌ 采集明细留全量历史:明细只留最新,**历史趋势由每日汇总表承担**。
