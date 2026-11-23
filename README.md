# GameOps · 游戏运营中台

> 面向游戏运营的一体化中台,集成**内容运营闭环**(创作者/稿件/活动/激励)
> 与 **Jenkins 风格的分布式爬虫调度**(中台 + 多台 Windows 爬虫机)。
>
> 中台部署在阿里云,爬虫机跑在本地 Windows 内网,**单向出站** 通信。

---

## 项目定位

后台权限按 `ADMIN ⊃ OPERATOR ⊃ REVIEWER` 分级，创作者独立登录 `/dashboard`。游客可在 `/inspirations` 浏览、分享和下载已发布素材。

| 角色 | 入口 | 核心能力 |
| --- | --- | --- |
| **创作者** Creator | `/dashboard` | 浏览/报名活动、投稿、看个人数据与预估激励 |
| **审核员** Reviewer | `/operator/submissions` | 查看本人获分配的周期和视频，逐条审核，维护个人资料 |
| **运营** Operator | `/operator/*` | 活动/稿件/创作者/采集任务全栈管理 + BI 大屏 |
| **管理员** Admin | `/operator/*` + `/operator/admin/*` | 运营全部 + Job 模板 CRUD + 爬虫机管理 + 用户管理 |

技术上是一个 Next.js 单仓库:同一域名按路径分流 + RBAC 中间件。

---

## 技术栈一览

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 前后端 | Next.js 14(App Router)+ React 18 + TypeScript | 一体化,Route Handlers 当后端 |
| 数据库 | PostgreSQL + Prisma 5 | 时区**统一 UTC 存储**,前端 `Asia/Shanghai` 展示 |
| 鉴权 | 自建 argon2 哈希 + jose 签 JWT,httpOnly cookie | middleware 在 Edge,只能用 jose |
| 校验 | Zod | 接口入参 + Job paramSchema + CSV 行 |
| UI | Tailwind v4 + shadcn/ui(radix-ui 命名空间) | 约定见 `docs/ui-conventions.md` |
| 图表 | Recharts | BI 按作品发布时间筛选，手动刷新 |
| 调度 | node-cron + cron-parser | Job 定时;`instrumentation.ts` 进程级启动 |
| Excel | xlsx (SheetJS) | EXCEL 类型参数客户端解析 |
| 爬虫端 | Python 3.10+(独立仓 + agent-reference 骨架) | 仅 HTTP 通信,Bearer token |
| 外发 | 飞书群自定义机器人 webhook | 运营日报与消息外发 |
| 部署 | 阿里云(中台)/ 本地 Windows + 任务计划程序(爬虫机) | 单向出站 |

---

## 仓库目录骨架

```
gameops/
├─ app/
│  ├─ (auth)/login/                        登录页(/login)
│  ├─ (creator)/dashboard/                 创作者工作台(/dashboard)
│  ├─ inspirations/                       公开素材库(/inspirations)
│  ├─ operator/                            运营 / 管理员后台(/operator/*)
│  │  ├─ tasks/                            采集任务(Job 视图 + 触发 + 执行历史)
│  │  ├─ datasets/                         入库数据集 / 留底文件
│  │  ├─ submissions/ activities/ creators/ inspirations/  内容运营
│  │  └─ admin/                            ADMIN 专属:Job 模板 / 爬虫机 / 运营账户
│  └─ api/
│     ├─ agent/                            爬虫机调用(Bearer 鉴权)
│     ├─ operator/                         后台接口，按操作校验角色与数据范围
│     └─ admin/                            管理员接口
├─ components/ui/                          shadcn 原语(radix-ui 命名空间)
├─ lib/                                    跨层共享:auth / rbac / db / api / validation / parsers
├─ prisma/                                 schema + migrations
├─ docs/                                   设计文档
├─ agent-reference/                        Python 爬虫机参考实现(可直接拷部署)
└─ data/                                   运行时落盘:raw/<csvType>/  logs/<taskId>.log
```

---

## 核心模块速览

### 1. 鉴权 & RBAC

- `lib/auth.ts` / `lib/session.ts`:argon2 + jose 签 JWT,默认 7 天
- `lib/rbac.ts`:页面与接口按所需角色鉴权，审核服务另校验视频归属
- `middleware.ts`:Edge,路由级第一道关

### 2. 爬虫调度(Jenkins 风格)

文档:`docs/agent-protocol.md` 协议;`docs/agent-setup-guide.md` 部署。

```
Job (模板)        Task (单次执行)         Agent (爬虫机)
─────────────    ───────────────────    ───────────────
绑定 Agent       由 Job 触发(MANUAL     1 台 = 1 token
仓库 + 命令模板    /AUTO/rerun)          常驻 + 心跳 1min
参数 schema      paramValues + 序号      并发 = 1 队列
产物清单(glob)  状态机:PENDING →       Bearer 鉴权
单次超时           RUNNING → SUCCEEDED   ┌→ git clone/pull
可选 cron                  → FAILED      │  渲染命令模板
                            → CANCELED   │  跑命令 + tee log
                                          │  捡产物上传中台
                                          └→ /result
```

**关键设计**:
- `claim` 用 `SELECT … FOR UPDATE SKIP LOCKED` + `NOT EXISTS` 子查询,保证同 Agent **并发 = 1**
- 失败一律 FAILED 不自动重试;管理员/运营手动「重跑」克隆新 task
- 取消通过 `/log` 端点 4xx 信号传递,agent 5s 内 kill 子进程
- 所有 `task.trigger/cancel/rerun/requeue` 都写 `AuditLog`(留人 + 时间)

### 3. 产物 / 数据集

- Job.outputs[*]:`path`(支持 glob `*` / `?` / `[]`)+ 可选 `csvType` + `optional` 标志
- **csvType 非空** → 上传中台 + 落 `data/raw/<csvType>/` + 跑 parser/snapshot(若注册)
- **csvType 为空** → **仍然上传** + 落 `data/raw/_uncategorized/`,数据集页可下载,不入解析层
- `optional: true` → 文件/glob 无匹配时静默跳过,不报错(适合"按参数条件产出"的产物)

### 4. UI 约定

详见 `docs/ui-conventions.md`。要点:
- 表单控件优先用 `components/ui/*` shadcn 封装,**禁裸用** `<select>` / `type="date"`
- 单选 → `Select`,日期 → `DatePickerField`,日期+时间 → `DateTimePickerField`
- 新增 shadcn 原语:`from "radix-ui"` 命名空间导入,`data-slot` + `cn()`
- URL 同步筛选条 → client component + `router.push`

### 5. 时区策略

- **PG `gameops` 数据库**:`timezone TO 'UTC'`(已设)
- **Prisma 写入**:JS `new Date()` → ISO with `Z` → 存 UTC 裸值
- **前端**:`lib/format.ts` 锁 `timeZone: "Asia/Shanghai"` 渲染
- **agent 端 SQL `NOW()`**:`(NOW() AT TIME ZONE 'UTC')` 显式 UTC

---

## 启动开发

### 一次性

```powershell
# 1. 装依赖(Node 20+ / pnpm 10+)
pnpm install

# 2. .env 配置(参考 .env.example)
#    DATABASE_URL=postgres://...
#    AUTH_SECRET=...

# 3. 生成 Prisma Client，再对开发库应用迁移
pnpm db:generate
pnpm db:migrate

# 4. (可选)种子数据
pnpm db:seed
```

### 日常

```powershell
pnpm dev              # 起 dev server,http://localhost:3000
pnpm db:studio        # 浏览 DB
pnpm typecheck        # 提交前必跑
pnpm test             # vitest 单元 / 集成
```

### 改 schema 的标准流程

```powershell
# 1. 编辑 prisma/schema.prisma
# 2. 停 dev(Prisma EXE 在 Windows 会被进程锁住)
# 3. pnpm db:migrate          ← 生成 SQL + 应用 + 重新生成 client
# 4. pnpm dev                 ← 重启
```

---

## 爬虫机接入

管理员创建爬虫机并取得 Token 后，将 `agent-reference/` 复制到 Windows 机器，通过 `install.cmd -BaseUrl "<中台地址>" -Token "<agentId>.<secret>"` 注册常驻计划任务。安装条件和更新步骤见 [Agent 安装手册](agent-reference/README.md)。

---

## 编码约定

- **禁止 `any`**:不确定用 `unknown` 再收窄
- API 必走 `lib/api.ts` 的 `route()` 包,Zod 校验入参,错误抛 `AppError`
- DB 必走 `lib/db.ts` 的 `prisma` 单例
- 受保护页/接口 按角色调用 `requireRole` 兜底(中间件是第一道,这是第二道)
- middleware 运行在 Edge,**只能** 用 jose,不能 import argon2 / prisma
- 改数据模型:`schema.prisma` → migrate → 写代码;不手写 DDL
- 提交前:`pnpm typecheck && pnpm test`

---

## 业务模块与文档

| 业务入口 | 使用方式 | 详细说明 |
| --- | --- | --- |
| 稿件管理 | 运营建立统计周期并分配视频，审核员逐条判定并选择标签。运营可按作品查看审核历史。 | [审核与分配](docs/submissions-design.md) |
| 活动管理 | 征稿活动接受报名投稿，按活动规则预估激励。专题活动从视频库匹配作品，对通过审核的作品试算奖池，并在确认时冻结结果。 | [专题活动与结算](docs/special-activities.md) |
| 运营概览与 BI | 概览跟进项目、审核、活动和舆情。BI 按发布时间分析作品传播、达人排行和审核质量。 | [BI 指标口径](docs/bi-dashboard-design.md) |
| 创作灵感 | 运营发布教程和多文件素材，游客与创作者按主题、类型检索，可预览、分享或下载。 | [公开素材库](docs/inspirations.md) |
| 运营助手与舆情 | 检索知识库、查询项目数据，查看公域、私域和对比报告。 | [知识库编辑](docs/knowledge-editor.md) · [舆情分析](docs/opinion-monitor.md) |

按角色阅读 [创作者手册](docs/user-guides/creator-guide.html)、[运营与审核手册](docs/user-guides/operator-guide.html) 或 [管理员手册](docs/user-guides/admin-guide.html)。

开发与部署参考 [系统架构](docs/architecture.md)、[UI 约定](docs/ui-conventions.md)、[Agent 协议](docs/agent-protocol.md)、[爬虫机接入](docs/agent-setup-guide.md) 和 [阿里云部署指南](docs/deploy-aliyun-guide.html)。协作规则见 [AGENTS.md](AGENTS.md)。

## 反馈 / 提交

提交前 checklist:
- [ ] `pnpm typecheck` 干净
- [ ] `pnpm test` 通过
- [ ] 改了 UI 跑过 dev 浏览器实测
- [ ] 改了 schema → migration 在干净 DB 上能从 0 跑通

PR 描述说清:**改了什么**、**为什么**、**怎么验证**。
