# 游戏运营中台 — 架构设计文档

> 版本:v0.2(设计草案) · 技术栈:Next.js + Node + TypeScript,爬虫端 Python
> 本文档用于团队评审与开发对齐,确定后进入编码阶段。
> v0.2 变更:确定部署(阿里云+本地爬虫机)、Python Agent、数据三层策略、
> 飞书 webhook 同步、CSV→表映射改为代码内定义、激励规则组合引擎。

---

## 1. 项目概述

服务于游戏运营的中台网站,面向三类用户提供差异化功能。核心特征:

- **多角色分流**:登录后按角色跳转到不同工作台。
- **内容运营闭环**:创作者投稿 → 运营审核管理 → 活动激励结算。
- **分布式数据采集**:多台本地 Windows 爬虫机执行 Python 爬虫,CSV 回传中台入库。
- **数据可视化与外发**:BI 大屏(分钟级刷新),每日汇总数据推送飞书群。

---

## 2. 用户角色与权限

三类角色为**层级关系**,高层级包含低层级权限。

| 角色 | 入口 | 核心功能 |
|------|------|----------|
| 创作者 Creator | 创作者工作台 | 参与活动、投稿、查看预估激励、个人数据 |
| 运营 Operator | 运营后台 | BI 大屏、稿件管理、创作者管理、活动管理、启动爬虫任务 |
| 管理员 Admin | 运营后台 + 管理面板 | 运营全部功能 + 爬虫任务管理 + 机器管理 + 用户权限管理 |

权限层级:`Admin ⊃ Operator`,Creator 为独立的对外角色。

**实现**:RBAC。用户表带 `role`;中间件按"所需最低角色"判断(接口要求 Operator,则 Operator 与 Admin 均通过)。后续权限若需细化,再平滑升级为"角色-权限点"模型,初期不过度设计。

**登录**:账密自建。密码 argon2/bcrypt 哈希;会话用 JWT(httpOnly cookie)。创作者与运营**共用登录入口**,按 `role` 跳转不同首页。

---

## 3. 技术选型

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | Next.js 14 (App Router) + React + TS | 创作者端与运营端按路由分组隔离 |
| UI/样式 | Tailwind CSS + shadcn/ui | 运营后台表格/表单密集,组件库提效 |
| 图表/大屏 | ECharts | 大屏复杂可视化首选 |
| 后端 | Next.js Route Handlers + Node | 一体化;调度逻辑可后续拆独立服务 |
| 数据库 | PostgreSQL + Prisma | 数据量小(总量约 10w),关系型足够 |
| 缓存/队列 | Redis | BI 指标缓存、会话(任务队列亦可先用 DB) |
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
│  │ PostgreSQL  │   │   Redis      │   │ 飞书 webhook    │──┼──> 飞书群
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
活动浏览与报名、投稿与状态查看、预估激励查看、个人数据。

### 5.2 运营端
BI 大屏、稿件管理(审核/筛选/批量)、创作者管理、活动管理(含激励规则配置)、启动爬虫任务。

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

1. **原始层 staging**:Agent 回传 CSV 原样落地(通用原始记录表,每行存 JSON + 元数据:来源任务、csvType、采集时间)。忠实留底,不做业务判断。
2. **明细层 detail(只留最新)**:按 csvType 对应的解析器(代码内定义 + Zod 校验)处理,**upsert 覆盖**,每个作品只保留最新数据。
3. **每日汇总层 daily summary**:每天定时跑一次,对全部作品当天数据做汇总快照(每天一行/一批),**此层承担历史趋势**——日积月累形成时间序列。

每种 CSV 新增时:代码内加一个解析器(列映射 + Zod schema + 目标表 upsert 逻辑)。因 CSV 较多,建议抽象统一的"解析器注册"机制,新增 CSV 只实现一个解析器接口。

### 6.3 每日汇总 + 飞书同步

- 定时任务跑出每日汇总表后,通过**飞书群自定义机器人 webhook** 推送一张消息/表格卡片到群。
- webhook 方式无需申请应用、无需审批,中台 POST 卡片 JSON 即可。
- 配置项:webhook URL(及可选签名密钥)放环境变量;推送内容/格式做成模板。

### 6.4 BI 大屏:分钟级刷新

数据来源:明细层 + 每日汇总层 + 业务数据(稿件/活动/创作者)。
分钟级需求 → **预聚合 + 缓存**,不上实时推送:定时(1–5 分钟)聚合写 Redis/聚合表,前端按间隔轮询。图表用 ECharts。

### 6.5 预估激励:组合规则引擎(半自动)

- 规则在**运营创建活动时指定**,以结构化 JSON 存于活动。
- 规则支持**多种组合**:阶梯式(分档金额)、公式式(系数计算)等规则块可叠加。
- 引擎:读取规则 JSON + 采集数据 → 计算预估值。实现为纯函数 + 规则块解释器,便于测试与扩展。
- 半自动:运营结算前可人工调整/覆盖,记录调整人、原因、前后值(审计)。
- 创作者端展示"预估",标注最终以结算为准。
- 编辑器:运营端提供表单式规则配置 UI(选规则类型 → 填参数 → 可叠加),生成规则 JSON。先做基础表单,不做复杂可视化拖拽。

---

## 7. 数据库 Schema 草案

```prisma
enum Role { CREATOR OPERATOR ADMIN }

// ── 用户与权限 ──
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  role         Role
  status       String   @default("active")
  createdAt    DateTime @default(now())
  creator      Creator?
}

model Creator {
  id          String  @id @default(cuid())
  userId      String  @unique
  user        User    @relation(fields: [userId], references: [id])
  nickname    String
  tier        String?
  platforms   Json?
  submissions Submission[]
  incentives  Incentive[]
}

// ── 活动 / 稿件 / 激励 ──
model Activity {
  id          String   @id @default(cuid())
  name        String
  status      String                          // draft/ongoing/ended
  startAt     DateTime
  endAt       DateTime
  rewardRules Json                            // 组合规则配置(供引擎读取)
  submissions Submission[]
}

model Submission {
  id         String    @id @default(cuid())
  creatorId  String
  activityId String?
  title      String
  url        String
  platform   String
  status     String    @default("pending")    // pending/approved/rejected
  reviewNote String?
  createdAt  DateTime  @default(now())
  creator    Creator   @relation(fields: [creatorId], references: [id])
  activity   Activity? @relation(fields: [activityId], references: [id])
}

model Incentive {
  id           String   @id @default(cuid())
  creatorId    String
  activityId   String?
  estimated    Decimal                         // 系统预估
  adjusted     Decimal?                        // 人工调整后
  adjustedBy   String?
  adjustReason String?
  status       String   @default("estimated")  // estimated/settled
  creator      Creator  @relation(fields: [creatorId], references: [id])
}

// ── 爬虫:机器 / 任务 / 执行 ──
model CrawlerMachine {
  id         String    @id          // machine_id
  name       String
  secretHash String
  lastSeenAt DateTime?
  status     String    @default("offline")
}

model CrawlerTask {
  id              String   @id @default(cuid())
  name            String
  csvType         String                // 产出 CSV 类型(对应代码内解析器)
  targetMachineId String?               // 指定机器,空=任意可用
  schedule        String?               // cron,空=仅手动
  config          Json
  enabled         Boolean  @default(true)
  runs            CrawlerRun[]
}

model CrawlerRun {
  id         String    @id @default(cuid())
  taskId     String
  machineId  String?
  status     String    @default("pending")  // pending/claimed/running/succeeded/failed
  claimedAt  DateTime?
  finishedAt DateTime?
  rowsOk     Int       @default(0)
  rowsFailed Int       @default(0)
  errorMsg   String?
  rawFileRef String?                         // 归档原始 CSV 引用
  task       CrawlerTask @relation(fields: [taskId], references: [id])
}

// ── 数据三层 ──

// 原始层:所有回传 CSV 原样落地
model RawRecord {
  id          String   @id @default(cuid())
  runId       String
  csvType     String
  payload     Json                            // 单行原始数据
  collectedAt DateTime @default(now())
  @@index([csvType, collectedAt])
}

// 明细层:只留最新(示例,实际每种业务对象一张)
model WorkDetail {
  id          String   @id @default(cuid())
  workKey     String   @unique                // 业务主键,用于 upsert
  title       String?
  platform    String?
  views       Int      @default(0)
  likes       Int      @default(0)
  updatedAt   DateTime @updatedAt
  // ... 按需扩展字段
}

// 每日汇总层:承担历史趋势,每天一批
model DailySummary {
  id          String   @id @default(cuid())
  date        DateTime                         // 汇总日期
  metric      String                           // 指标名
  value       Decimal
  dims        Json?                            // 维度(平台/活动等)
  createdAt   DateTime @default(now())
  @@index([date, metric])
}
```

> `WorkDetail` / `DailySummary` 为示意。明细表只 upsert 留最新;趋势看 `DailySummary`(每日快照累积)。

---

## 8. 部署与网络

- **中台**:阿里云服务器,常驻 Node + PostgreSQL + Redis。配 HTTPS 域名(供爬虫机出站访问)。
- **爬虫机**:本地 Windows,Python Agent 做成 Windows 服务开机自启;只需能出网访问中台域名。
- **网络**:单向出站,中台无需访问爬虫机内网。开发期 Agent → `localhost:3000`,上线改为阿里云域名。
- **环境变量**:Zod 校验(见 `lib/validation/env.ts`),含 DB、Redis、JWT 密钥、飞书 webhook URL。

---

## 9. 开发路线(分阶段)

1. **地基**:骨架 + CLAUDE.md + 错误/环境/DB 单例(已具备)+ 用户表 + 认证 + RBAC 中间件。
2. **创作者端 MVP**:登录分流、活动浏览、投稿、稿件状态。
3. **运营端核心**:稿件管理、创作者管理、活动管理(含激励规则表单)。
4. **爬虫链路**:机器/任务/执行模型 + Agent 协议接口 + Python Agent 雏形 + 一种 csvType 解析入库(三层)打通。
5. **激励引擎**:组合规则引擎 + 预估计算 + 人工调整审计。
6. **每日汇总 + 飞书**:汇总定时任务 + webhook 推送。
7. **BI 大屏**:指标聚合 + 缓存 + ECharts 可视化。
8. **管理员面板**:爬虫任务/机器监控/用户管理。
9. **完善**:其余 csvType 解析器、调度自动化、测试与监控。

---

## 10. 待确认事项(剩余)

- 各 csvType 的具体列定义 → 用于编写对应解析器与明细/汇总表(可在阶段 4 起逐个补充)。
- 激励规则的具体规则块类型与参数(阶梯档位、公式因子等)→ 用于设计规则引擎接口。
- 每日汇总推送飞书的具体内容与卡片样式。
- 创作者绑定的外部平台有哪些(影响 platforms 字段与采集)。

## 附:已放弃/简化的方案(记录决策)

- ❌ 可视化建表(运营网页定义表与汇总规则):复杂度过高,改为**代码内定义映射**。
- ❌ 中台直连爬虫机的推模型:改为 **Agent 拉模型**(适配内网)。
- ❌ 飞书开放平台应用:改为**群自定义机器人 webhook**(无需审批)。
- ❌ 采集明细留全量历史:明细只留最新,**历史趋势由每日汇总表承担**。
