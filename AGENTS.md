# 游戏运营中台 (AGENTS.md)

> Codex 自动读取。保持与代码一致。

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
- 四类角色层级:ADMIN ⊃ OPERATOR ⊃ REVIEWER,CREATOR 独立对外。共用登录入口,按 role 跳转。审核角色(REVIEWER)仅可查看分配给自己的周期/稿件、单条审核自己的分配和修改自己的账户资料,首页 `/operator/submissions`;易闪导入仍需 OPERATOR。角色定义与页面范围在 `lib/roles.ts`;页面及接口各自 `requireRole` 兜底,布局用 middleware 覆盖的路径头与数据库最新角色检查审核页面范围。
- **后台身份(审核/运营/管理员)**:`User.username` 为固定账号名称(3–32 位字母/数字/`_ . -`,唯一、创建后不可修改),`User.displayName` 为可自助修改的显示用户名(1–32 字符,支持中文、可重复);旧账户显示回退到 `username`。登录和审计 `actorUsername` 继续使用固定账号名称。创作者端维持原有 `User.username + Creator.nickname` 语义。
- 爬虫 Agent 拉模型:爬虫机轮询中台领任务、回传 CSV,中台不主动连爬虫机。
- **Jenkins 风格 Job/Task**:Job 是模板(绑 Agent + repo + 命令模板 + 参数 schema + 产物清单 + 可选 cron),Task 是一次执行。Task 创建时冻结 `jobRevision + jobSnapshot`,Agent 执行前再冻结实际 `sourceRevision + executionSnapshot`;排队后编辑模板不改变本次执行,重跑克隆原配置与源码 revision。同一 Agent 上相同 `repoType + repoUrl` 的 Job 共用一个本地仓库副本,`workdir` 选择仓库内执行目录。Agent 并发=1;失败不自动重试。详见 `docs/agent-protocol.md`。
- **关键动作走审计**:`task.trigger / cancel / requeue / rerun / priority` 都写 `AuditLog`(actorId + actorUsername 快照 + targetType/targetId + details JSON)。
- **Job 开关语义**:`enabled` 仅控制 cron 自动触发,手动触发(MANUAL/rerun)始终允许;`active` 是总开关,关闭后任何方式都不可触发。
- **产物分类入库**:Job.outputs 支持 glob(`*` `?` `[]`) + `optional` 标志;csvType 非空 → 入 `data/raw/<csvType>/` 并跑 parser;csvType 空 → 入 `_uncategorized/` 仅留底可下载,不解析。
- **时区**:PG 数据库强制 `timezone='UTC'`,前端用 `lib/format.ts` 锁 Asia/Shanghai 渲染;raw SQL 用 `(NOW() AT TIME ZONE 'UTC')` 显式 UTC。
- CSV→表映射写在代码内(每种 csvType 一个解析器,见 lib/parsers/index.ts)。
- 数据三层:原始层(留底)→ 明细层(upsert 只留最新)→ 每日汇总层(历史趋势)。
- **激励引擎**:7 类规则块可叠加(TIER / FORMULA / SHARE_POOL / RANK / PER_SUBMISSION / ACTIVITY_THRESHOLD / BASE_PLUS_STEP),每条规则可挂 `cap`(元)与 `cpmCap`(元/千播放,创作者 views=0 不生效)。引擎纯函数 `lib/incentive/engine.ts`,聚合层 `lib/incentive/aggregate.ts`(候选 = 报名 ∪ 投稿)。结果落 `Incentive` 表(`(creatorId, activityId)` 唯一);重算覆盖 `estimated/breakdown/computedAt`,人工 `adjusted` 字段保留。审计:`incentive.compute`(全活动重算) / `incentive.adjust`(单条调整)。

## 目录约定
- BI `/operator/bi` 仅OPERATOR/ADMIN可见，按北京时间作品发布时间统一筛选VideoStat有效视频（排除hidden/空日期）；默认最近有作品的日期（最晚昨天）向前30天并提示实际范围，无数据时截至昨天，上限366天。核心指标/排行/分层/平台分布同口径，播放量为所选作品当前累计值；合格率=合格/(合格+不合格)，审核进度=已审核/总数。每日发布取VideoStat；每日播放变化通过DailyVideoStat窗口LAG仅比较同视频相邻日有快照的样本，缺失留空、零值和负值保留，不做全表快照自连接。底部活动/审核周期/综合舆情为独立当前状态，舆情Suspense隔离并限时降级。无自动轮询，手动刷新；详情见docs/bi-dashboard-design.md。
- 专题活动计奖联动VideoStat审核结果：活动匹配明细保留全部有效稿件，奖池排名/达人汇总/计奖仅纳入APPROVED，待审/不合格/缺失审核结果均记录排除原因。预估快照保存reviewStatus/reviewedAt、reviewPolicy与审核计数，缺失指标/UID校验只针对通过稿件。确认结算要求活动匹配的全部有效稿件已完成审核，存在待审即禁止结算并提示数量；共用审核锁7264232，重算并比较包含审核结果的指纹后冻结v2快照；已冻结历史结算沿用原快照。审核保存后失效未结算活动卡片缓存。
- `/operator/dashboard` 运营概览要求OPERATOR，按项目数据、稿件管理、活动管理、舆情监控四块独立Suspense加载。项目数据默认本月（北京时间），支持最近12个月切换，VideoStat按发布时间统计有效视频的当前累计播放量及每日发布量；主播为全库计数，直播按所选自然月汇总。稿件待审/合格/不合格/未分配及进度取全库有效VideoStat，展示最近2个审核中周期并复用周期汇总。活动展示当前进行中的专题与征稿活动，按结束日期升序最多4项；舆情复用分析服务计数和最近3个任务，超时3.5秒单独降级。月份只影响项目数据，点击刷新重新请求各块，不轮询。
- 稿件管理新入口：`/operator/submissions` 全部稿件改为VideoStat周期统计卡片，不显示明细列表；`/operator/submissions/review` 直接查询 `VideoStat` 视频库，不依赖征稿活动，默认有效视频；OPERATOR/ADMIN默认全部审核状态、按审核时间降序（空值末尾、同时间按ID降序），REVIEWER仍默认待审核并按发布时间升序（空日期末尾、同时间按ID升序）排列，支持隐藏状态筛选。不显示创作者ID；列为作品ID（`externalId`）、15字单行视频标题、标题旁审核、发布时间、审核员、审核时间（北京时间，无记录显示「—」）、审核状态、一级/二级/三级标签。标题仅显示与全文提示，无点击审核及悬停下划线。
- 稿件审核列表上方复用已创建的SubmissionPeriod卡片，展示周期名称/状态/日期、稿件数/达人数、合格与不合格数及推荐播放量、进度，不显示卡片操作按钮。默认展开最近1个周期，其他周期通过Collapsible展开/收起；卡片统计独立于视频列表筛选，角色范围沿用周期及汇总服务（审核员只读本人分配）。审核列表「开始审核」左侧提供紧凑审核活动Select，选项来自当前角色可见的SubmissionPeriod，切换同步周期起止日期并重置分页/单条弹窗参数，保留状态等其他筛选；全部活动清除日期范围，自定义日期单独标识，reviewPeriod只记录同日期周期的选中身份。两页共用SubmissionPeriodSummaryCard服务端包装器；审核工作台用ReactNode插槽接入服务端卡片，不新增接口。
- 全部稿件周期配置存 `SubmissionPeriod`（名称+起止日），运营/管理员可新建编辑多张卡片，审核员仅查看本人有分配的周期及本人稿件统计。按北京时间发布时间包含起止日全天、排除hidden/空日期视频；稿件数、平台+非空UID去重达人数、合格/不合格数及各自推荐播放量取VideoStat最新数据；审核进度=(合格+不合格)/总数，空周期0%。统计仅随页面刷新/请求更新，不定时轮询；名称q与状态status可组合筛选，状态REVIEWING/FROZEN由运营在编辑卡片时手动维护，仅卡片标识、不锁视频或冻结统计快照；全部稿件卡片按钮按角色显示：审核员为「前往审核」（携带周期起止日期、PENDING及keepFilters），运营/管理员为「查看详情」；全部稿件页头不再显示「进入稿件审核」，周期详情右上入口统一为「进入稿件审核」；详情页展示基本信息和审核统计，编辑入口移入详情页，审核员不显示编辑或分配面板。接口 `/api/operator/submission-periods` 要求OPERATOR，写入与审计同事务。
- 审核分配：`VideoReviewAssignment.videoId`为主键，视频全局唯一归属（重叠周期也不重复分配）；分配人与实际审核人`VideoStat.reviewerId`分开。运营/管理员在周期详情向启用的REVIEWER分配时间段内有效、待审核、未分配稿件；平均模式填写组总量后随机均分（组内最多差1条），指定量按每人配额；支持最多20组混合一次提交，同人跨组合计，各组总量不得超过可用量。先汇总配额再统一随机选稿、优先打散同作者，余量未分配，既有分配/结果不覆盖；兼容旧单组请求，坏组合不可回退为旧全量分配。分配、审核及周期修改共用事务锁7264232；分配候选锁视频行、审核员行共享锁。POST `/api/operator/submission-periods/[id]/assignments`要求OPERATOR，预览确认后执行；确认携带expectedEligibleCount，候选量变化返回409并要求重新预览；requestId+配置哈希+成功结果与分配审计同事务，成功请求重试优先返回原结果，不重复分配。已有分配后起止日不可修改，名称/状态仍可编辑。
- 分配权限贯穿列表/待审数/下一条游标/单条保存/视频预览/周期详情与统计，服务必须传当前会话身份；REVIEWER仅本人分配，OPERATOR/ADMIN看全部。旧Submission读写接口及旧详情只允许OPERATOR，防止绕过新分配权限；预览接口每次验证归属且no-store。
- 连续审核：顶部「开始审核」进入当前搜索/平台/可见性/日期范围最早待审作品，不受列表状态和分页限制；弹窗固定底部「保存并审核下一条」按发布时间+ID稳定游标继续（空日期最后），不使用分页offset，避免审核后待审数量变化导致跳条。保存成功而下一条加载失败时只重试读取，不重复PATCH；支持保存并关闭与队列末尾提示。队列读取接口 `/api/operator/video-reviews/next` 独立要求 REVIEWER。
- 审核弹窗预览按竖屏比例随可用高度适配；抖音官方播放器通过 `width=100%&height=100vh` 适配 iframe，避免内部滚动与右侧空白。审核标签使用三个独立的三级联动 Select，修改上级清空下级，保存末级并由列表展开祖先；未修改选择时保留旧多路径/深层标签。审核备注位于标签下方。
- 单条审核保存必填：状态必须为 APPROVED/REJECTED，标签必须选至当前分支的可用末级（最多三级，无二级/三级或下级均停用时不要求补选）。两个保存按钮共用行内错误及首错聚焦；服务端同规则在标签事务锁内校验，防止层级变更后保存不完整分支。稿件审核页取消多选和批量提交，原视频批量接口返回404；已保存后的下一条重试不再次校验或PATCH。
- 视频审核持久化在 `VideoStat.reviewStatus/reviewNote/reviewerId/reviewerName/reviewedAt`，审核员取当前会话并保留显示名快照；采集更新不覆盖人工审核。单条接口 `/api/operator/video-reviews` 下独立鉴权，审核与日志快照同事务保存，结果不改旧 `Submission`。上线后执行 `prisma/backfill-video-reviews.ts` 按平台+作品ID继承匹配的历史结果，已人工审核的视频不覆盖。
- 稿件审核日志：表格最右侧入口及 GET `/api/operator/video-reviews/[id]/logs` 仅OPERATOR/ADMIN可见/可读；服务层也要求OPERATOR。复用AuditLog(video.review)保存审核人显示名/固定账号、审核时间、结果、完整标签路径及备注快照，不随改名变化；每页20条倒序，不套管理员审计页60天限制。兼容旧单条tagIds及旧批量ids，历史缺失信息明确提示；无审计但有当前结果时只回显可恢复状态，首次覆盖前事务内留存旧结果，标签按留存时名称标注。无需数据库迁移。
- 审核标签存 `ReviewTag` 自关联树，与 `Submission` 及 `VideoStat` 多对多；列表按所选标签路径展开前三层。标签管理右侧按一级标签分区，同级标签采用一致行样式与层级标识，有子标签可折叠展开，下级内容缩进并通过连接线区分；搜索保留祖先上下文，标签操作通过各自菜单进入，适配移动端。父级停用使整条分支不可新选，历史关联保留。标签管理与标签选择共用事务锁，防循环/同级重名/停用竞态；有子级或任一稿件/视频引用的标签不可删除。
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
