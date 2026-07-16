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
- **手动导入**:运营可在「视频数据」页直接上传视频明细表(`POST /api/operator/data/videos/import`,收 CSV/Excel,固定 csvType=`douyin_video_detail`),复用同一 parser + snapshotter,`RawDataset.taskId=null`,审计 `data.import`,用于补录/回填。
- **主播数据(`app/operator/data/streamers`)**:**名单 = `AnchorStat` 表(运营导入维护,为主;未来可加爬虫),`@@unique([platform, uid])`**——保证「本月没发作品的主播也在名单内」。导入走 `POST /api/operator/data/streamers/import`(csvType=`anchor_roster`,parser `lib/parsers/anchor-roster.ts` 按 `(platform, uid)` upsert,**只写身份/花名册字段、缺列不冲空**、无 snapshotter,审计 `data.import`)。识别列:主播平台 / UID(必需)/ 主播昵称 / 抖音号 / 入会时间 / 团号 / 运营经纪人 / 招募经纪人 /(可选)粉丝量。页面 = 以 `AnchorStat` 为基表,**按 UID `LEFT JOIN` 聚合明细**得数值列(`_lib/query.ts` 用 `Prisma.sql`/`Prisma.join` 拼名单 where + 视频聚合子查询 + 白名单 orderBy):作品数 / 作品播放量 / 作品推荐播放量 / 涨粉 ← 视频明细 `VideoStat`(`hidden=false`);粉丝量 ← 名单自带或后续直播明细覆盖;**直播维度(直播天数 / 直播时长 / ACU / 曝光人数·次数 / 进直播间人数·次数 / 人均观看时长)← 直播明细 `LiveStat` 第二段 LEFT JOIN**(SUM 类累计,率·均值类如 ACU / 人均观看时长按开播天数 AVG;直播天数 = 开播天数 = LiveStat 行数,因只入库开播时长>0)。**无 `直播场次`(源表无此列)**。名单筛选(搜索 / 团号)作用于名单,日期窗口(默认本月)同时收窄视频与直播两段聚合子查询(不影响主播在列)。
- **直播数据(`app/operator/data/live`)**:数据源 `LiveStat` 表(直播明细,**主播 × 自然日一行**,`@@unique([platform, uid, date])`),来自脚本「所有主播画像表」CSV。导入走 `POST /api/operator/data/live/import`(csvType=`live_detail`,parser `lib/parsers/live-detail.ts` 按 `(platform, uid, date)` upsert,无 snapshotter,审计 `data.import`),爬虫上报同一 parser。**入库规则**:①只入「有效开播时长 > 0」的行(空开播行跳过,`skippedCount` 计数);②UID 取 `UID2` 列去前缀(普通 `UID` 列会被 Excel 转科学计数法丢精度),回退还原 `UID`;③排除两列不入库:`直播-游戏流水(分成前)(元)` / `直播-主播游戏收入(分成后)(元)`;④`日期` 用 `Date.UTC` 存 `@db.Date`(避免本地时区偏移);⑤备注列即团号存 `note`。页面默认仅显示本月(按 `date`),往月用日期筛选,带导入/导出。字段:音浪 / 有效开播时长 / 曝光人数·次数 / 进直播间人数·次数 / 进直播间转化率 / 人均观看时长 / 打赏人数·次数 / 新增粉丝 / ACU。
- **达人删除/隐藏(VideoStat.hidden)**:每次导入(手动 + 爬虫)按 `externalId` **在本次「发布日期窗口」内比对**——导入只覆盖某发布区间(某月/某几日),不是全库快照,所以窗口取自 CSV 的 `视频发布日期起/止` 列(缺失时用本次 `publishedAt` 的最早/最晚天兜底)。命中且有标题的行 `hidden=false`;**窗口内**在库但本次缺失(`lastDatasetId ≠ 本次` 且当前正常)→ `hidden=true` + `hiddenAt`;**命中但只有链接无视频标题**(平台已删/隐,取不到标题)也判 `hidden=true`;**窗口外**(往月/其它区间)一律不动;重新出现(且有标题)自动恢复。无法确定窗口则跳过检测(宁可不标不误标)。**hidden 行不参与任何统计/激励计算**(激励聚合、BI、视频页统计卡均排除),仅留存并在视频数据表格展示(附「正常/已删除隐藏/全部」筛选)。
- **激励引擎**:7 类规则块可叠加(TIER / FORMULA / SHARE_POOL / RANK / PER_SUBMISSION / ACTIVITY_THRESHOLD / BASE_PLUS_STEP),每条规则可挂 `cap`(元)与 `cpmCap`(元/千播放,创作者 views=0 不生效)。引擎纯函数 `lib/incentive/engine.ts`,聚合层 `lib/incentive/aggregate.ts`(候选 = 报名 ∪ 投稿)。结果落 `Incentive` 表(`(creatorId, activityId)` 唯一);重算覆盖 `estimated/breakdown/computedAt`,人工 `adjusted` 字段保留。审计:`incentive.compute`(全活动重算) / `incentive.adjust`(单条调整)。
- **舆情监控**(详见 `docs/opinion-monitor.md`):三份报告(私域 / 公域 / 对比)由独立 Docker 容器 `slg_analyzer/service`(FastAPI wrapper of run.py / run_public.py / run_combined.py)生成,中台代理调用。**中台不落 OpinionReport 表**,任务状态与元数据由分析服务 SQLite 持有,中台只存单例 `OpinionSettings`(LLM 配置,`apiKey` AES-256-GCM 加密)。产物 HTML+JSON 由后台 downloader 每 10s 从分析服务拉回 `storage/opinion-reports/<taskId>/`,通过鉴权 route `/operator/opinion/reports/<id>/view` 新页面打开(不用 iframe)。权限:OPERATOR 只读列表/查看报告,ADMIN 触发/删除/重跑/改设置。审计:`opinion.trigger / rerun / delete / settings.update`(明文 apiKey 永不入日志)。

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
- **舆情监控 env**:`ANALYSIS_BASE_URL`(分析服务地址,dev 默认 `http://127.0.0.1:8000`)/ `ANALYSIS_SHARED_SECRET`(Bearer token,与分析服务同源)/ `OPINION_AES_KEY`(32 字节 base64,加密 apiKey 用)。缺失只 warn 不阻塞其他功能,首次触发接口时懒失败。
- **分析服务本地起法**:`cd F:\Kaifa\data-hub\services\slg && docker compose up -d`(先在 shell 或该目录 `.env` 设 `ANALYSIS_SHARED_SECRET`)。中台 dev 侧同一台机器起 `pnpm dev` 即可。分析服务已迁入爬虫总集仓 `data-hub`(见 `docs/crawler-monorepo-plan.md`);旧 `slg_analyzer` 目录仅作回溯保留。

## 开发阶段(当前:阶段 9 完成,舆情监控上线)
1.✅地基+认证+RBAC+登录分流  2.✅创作者端MVP(活动/报名/投稿)  3.✅运营端核心(含创作灵感)
4.✅爬虫链路+Agent
   4.1 ✅协议骨架 / 4.2 ✅parser+明细 / 4.3 ✅每日汇总 / 4.4 ✅运营 UI
   4.5 ✅Jenkins-style 重构(Job 模板 + 命令模板 + 并发=1 + cron + 实时日志)
   4.6 ✅审计日志 + cron 仅控自动 + 分页 + EXCEL/可选/glob 产物 + UTC 时区
5.✅激励引擎(7 类规则 × cap/cpmCap + 聚合层 + `Incentive` 表 + 创作者端预估卡 + 运营端结算明细 + 人工调整审计)
6.每日汇总+飞书(cron 补每日快照漏洞)
7.✅BI 大屏(shadcn Card + 交互式 LineChart + Donut + Fullscreen API)
8.✅管理员面板(运营账户 / Job / 爬虫机 / csvType / **审计日志查看**:近 60 天硬底 + 多维筛选 + 详情 Dialog + 可选每页条数)
9.✅舆情监控(私域 / 公域 / 对比 三份报告:独立 FastAPI 分析容器 + 中台代理 + 后台 downloader + 鉴权跳转打开 HTML + AES 加密 apiKey 单例配置面板)

# 对话规范

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
