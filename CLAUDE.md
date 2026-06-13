# 游戏运营中台 (CLAUDE.md)

> Claude Code 自动读取。保持与代码一致。

## 技术栈
- 前端/后端:Next.js 14 (App Router) + React + TypeScript(一体化)
- 样式:Tailwind CSS(后台风格,克制专业,非炫技)
- 数据库:PostgreSQL + Prisma
- 鉴权:自建,argon2 哈希 + jose 签发 JWT(httpOnly cookie)
- 校验:Zod
- 爬虫端:Python(Agent + 爬虫),与中台仅 HTTP 通信
- 外发:飞书群自定义机器人 webhook
- 部署:中台→阿里云;爬虫机→本地 Windows 内网(单向出站)

## 架构要点(详见 docs/architecture.md)
- 三类角色层级:ADMIN ⊃ OPERATOR,CREATOR 独立对外。共用登录入口,按 role 跳转。
- 爬虫 Agent 拉模型:爬虫机轮询中台领任务、回传 CSV,中台不主动连爬虫机。
- **Jenkins 风格 Job/Task**:Job 是模板(绑 Agent + repo + 命令模板 + 参数 schema + 产物清单 + 可选 cron),Task 是一次执行。Agent 并发=1;失败不自动重试,手动重跑克隆新 task。详见 `docs/agent-protocol.md`。
- **关键动作走审计**:`task.trigger / cancel / requeue / rerun / priority` 都写 `AuditLog`(actorId + actorUsername 快照 + targetType/targetId + details JSON)。
- **enabled 字段语义**:仅控制 cron 自动触发;手动触发(MANUAL/rerun)始终允许。
- **产物分类入库**:Job.outputs 支持 glob(`*` `?` `[]`) + `optional` 标志;csvType 非空 → 入 `data/raw/<csvType>/` 并跑 parser;csvType 空 → 入 `_uncategorized/` 仅留底可下载,不解析。
- **时区**:PG 数据库强制 `timezone='UTC'`,前端用 `lib/format.ts` 锁 Asia/Shanghai 渲染;raw SQL 用 `(NOW() AT TIME ZONE 'UTC')` 显式 UTC。
- CSV→表映射写在代码内(每种 csvType 一个解析器,见 lib/parsers/index.ts)。
- 数据三层:原始层(留底)→ 明细层(upsert 只留最新)→ 每日汇总层(历史趋势)。
- **激励引擎**:7 类规则块可叠加(TIER / FORMULA / SHARE_POOL / RANK / PER_SUBMISSION / ACTIVITY_THRESHOLD / BASE_PLUS_STEP),每条规则可挂 `cap`(元)与 `cpmCap`(元/千播放,创作者 views=0 不生效)。引擎纯函数 `lib/incentive/engine.ts`,聚合层 `lib/incentive/aggregate.ts`(候选 = 报名 ∪ 投稿)。结果落 `Incentive` 表(`(creatorId, activityId)` 唯一);重算覆盖 `estimated/breakdown/computedAt`,人工 `adjusted` 字段保留。审计:`incentive.compute`(全活动重算) / `incentive.adjust`(单条调整)。

## 目录约定
- app/(auth)/login        登录页(真实 URL /login)
- app/(creator)/dashboard 创作者端(真实 URL /dashboard)
- app/operator/*          运营/管理员端(真实 URL /operator/*)
- app/api/*               Route Handlers
- lib/                    auth/rbac/db/errors/api/validation 等核心
- prisma/schema.prisma    数据模型单一事实来源

## 编码约定
- 禁止 any;不确定用 unknown + 收窄。
- API 用 lib/api.ts 的 route() 包裹,Zod 校验入参,错误抛 AppError。
- DB 只用 lib/db.ts 的 prisma 单例。
- 受保护页面/接口用 lib/rbac.ts 的 requireRole 兜底(middleware 是第一道关)。
- middleware 运行在 Edge,只能用 jose,不能 import argon2/prisma。
- 改数据模型:先改 schema.prisma → migrate → 写代码,不手写 SQL DDL。
- 提交前:pnpm typecheck && pnpm test。

## UI 约定(详见 docs/ui-conventions.md)
- 表单控件优先用 `components/ui/*` 下的 shadcn 封装,**禁止裸用** `<select>` / `type="date"` / `type="datetime-local"` / 原生 checkbox。
- 单选下拉 → `Select`;日期 → `DatePickerField`(`app/(creator)/_components/`);日期+时间 → `DateTimePickerField`(`app/operator/_components/`);字段壳 → `Field` / `FieldLabel`。
- URL 同步的筛选条必须写成 client 组件 + `router.push`,不要用 `<form action>` 提交。Select 空值用哨兵 `"__all"`。
- 新增 shadcn 原语:`components/ui/<name>.tsx`,从 `"radix-ui"` 命名空间导入,沿用 `data-slot` + `cn()` 写法;不要直接装 `@radix-ui/react-*` 子包。

## 常用命令
- pnpm dev / build
- pnpm db:migrate / db:generate / db:studio / db:seed
- pnpm typecheck / lint / test / test:e2e

## 关键运行约束
- `paramSchema[*].name` 允许中文/字母/数字/下划线(Unicode `\p{L}` + `\p{N}`),agent 把 paramValues 全部注入子进程 env(脚本 `os.environ["开始时间"]` 读)。
- EXCEL 类型参数:运营端上传 .xlsx/.csv,前端用 xlsx 库解析为 `[{col:v,...}]` 数组,经 env 字符串(JSON)传给脚本。
- Job.command 用 `{{paramName}}` 模板,渲染规则见 `lib/jobs.ts` `renderCommand`;支持中文 var 名。
- Agent 取消监听:跑命令期间每 5s 空 POST `/log`,返回 4xx 即视为被取消 → kill 子进程。
- Task 日志页默认折叠,展开后只渲染尾 100 行;`?lines=N` / `?tail=N` / `?offset=N` / `?download=1` 四种模式。

## 开发阶段(当前:阶段 8 完成,管理员面板齐活)
1.✅地基+认证+RBAC+登录分流  2.✅创作者端MVP(活动/报名/投稿)  3.✅运营端核心(含创作灵感)
4.✅爬虫链路+Agent
   4.1 ✅协议骨架 / 4.2 ✅parser+明细 / 4.3 ✅每日汇总 / 4.4 ✅运营 UI
   4.5 ✅Jenkins-style 重构(Job 模板 + 命令模板 + 并发=1 + cron + 实时日志)
   4.6 ✅审计日志 + cron 仅控自动 + 分页 + EXCEL/可选/glob 产物 + UTC 时区
5.✅激励引擎(7 类规则 × cap/cpmCap + 聚合层 + `Incentive` 表 + 创作者端预估卡 + 运营端结算明细 + 人工调整审计)
6.每日汇总+飞书(cron 补每日快照漏洞)
7.✅BI 大屏(shadcn Card + 交互式 LineChart + Donut + Fullscreen API)
8.✅管理员面板(运营账户 / Job / 爬虫机 / csvType / **审计日志查看**:近 60 天硬底 + 多维筛选 + 详情 Dialog + 可选每页条数)
