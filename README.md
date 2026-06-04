# GameOps · 游戏运营中台

> 面向游戏运营的一体化中台,集成**内容运营闭环**(创作者/稿件/活动/激励)
> 与 **Jenkins 风格的分布式爬虫调度**(中台 + 多台 Windows 爬虫机)。
>
> 中台部署在阿里云,爬虫机跑在本地 Windows 内网,**单向出站** 通信。

---

## 项目定位

三类角色,层级关系 `ADMIN ⊃ OPERATOR`,`CREATOR` 独立对外。

| 角色 | 入口 | 核心能力 |
| --- | --- | --- |
| **创作者** Creator | `/dashboard` | 浏览/报名活动、投稿、看个人数据与预估激励 |
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
| 图表 | ECharts | BI 大屏(阶段 7) |
| 调度 | node-cron + cron-parser | Job 定时;`instrumentation.ts` 进程级启动 |
| Excel | xlsx (SheetJS) | EXCEL 类型参数客户端解析 |
| 爬虫端 | Python 3.10+(独立仓 + agent-reference 骨架) | 仅 HTTP 通信,Bearer token |
| 外发 | 飞书群自定义机器人 webhook | 阶段 6 接 |
| 部署 | 阿里云(中台)/ 本地 Windows + 任务计划程序(爬虫机) | 单向出站 |

---

## 仓库目录骨架

```
gameops/
├─ app/
│  ├─ (auth)/login/                        登录页(/login)
│  ├─ (creator)/dashboard/                 创作者工作台(/dashboard)
│  ├─ operator/                            运营 / 管理员后台(/operator/*)
│  │  ├─ tasks/                            采集任务(Job 视图 + 触发 + 执行历史)
│  │  ├─ datasets/                         入库数据集 / 留底文件
│  │  ├─ submissions/ activities/ creators/ inspirations/  内容运营
│  │  └─ admin/                            ADMIN 专属:Job 模板 / 爬虫机 / 运营账户
│  └─ api/
│     ├─ agent/                            爬虫机调用(Bearer 鉴权)
│     ├─ operator/                         OPERATOR 接口
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
- `lib/rbac.ts`:`requireRole("OPERATOR" | "ADMIN")` 服务端兜底
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
#    JWT_SECRET=...

# 3. 跑 migration
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

完整步骤见 `docs/agent-setup-guide.md` 和 `agent-reference/README.md`。最短路径:

```powershell
# 在管理员账号:/operator/admin/agents/new 拿到 token
# 把 agent-reference/ 整目录拷到爬虫机
cd D:\crawler\agent-reference
pip install -r requirements.txt
copy .env.example .env        # 填 CRAWLER_BASE_URL + CRAWLER_TOKEN

# 用任务计划程序注册 heartbeat(每分钟)和 executor(开机启动)
schtasks /create /xml ".\tasks\heartbeat.xml" /tn "GameOps Crawler Heartbeat"
schtasks /create /xml ".\tasks\executor.xml"  /tn "GameOps Crawler Executor"
schtasks /run /tn "GameOps Crawler Heartbeat"
schtasks /run /tn "GameOps Crawler Executor"
```

---

## 编码约定

- **禁止 `any`**:不确定用 `unknown` 再收窄
- API 必走 `lib/api.ts` 的 `route()` 包,Zod 校验入参,错误抛 `AppError`
- DB 必走 `lib/db.ts` 的 `prisma` 单例
- 受保护页/接口 `requireRole("OPERATOR" | "ADMIN")` 兜底(中间件是第一道,这是第二道)
- middleware 运行在 Edge,**只能** 用 jose,不能 import argon2 / prisma
- 改数据模型:`schema.prisma` → migrate → 写代码;不手写 DDL
- 提交前:`pnpm typecheck && pnpm test`

---

## 开发阶段(2026-06 状态)

| 阶段 | 状态 | 内容 |
| --- | :-: | --- |
| 1 | ✅ | 地基 + 认证 + RBAC + 登录分流 |
| 2 | ✅ | 创作者端 MVP(活动 / 报名 / 投稿) |
| 3 | ✅ | 运营端核心(含创作灵感) |
| 4 | ✅ | 爬虫链路 + Agent(已完成 Jenkins 风格重构) |
|   |    | · 4.5 重构:Job 模板 + 命令模板 + 并发=1 + cron + 实时日志 |
|   |    | · 时区统一 UTC 存 / 北京时间显示 |
|   |    | · 审计日志 `AuditLog`(trigger/cancel/rerun/requeue) |
|   |    | · Excel 参数 / 可选产物 / glob 通配 / 留底入库 |
| 5 | 🔜 | 激励引擎(规则块组合 + 半自动结算) |
| 6 | 🔜 | 每日汇总 + 飞书 webhook + cron 兜底 |
| 7 | 🔜 | BI 大屏(ECharts + 预聚合) |
| 8 | 🔜 | 管理员面板(审计日志查看 / 权限细化) |

---

## 文档导航

| 文档 | 谁该看 | 内容 |
| --- | --- | --- |
| `README.md` | 新接手 | 你正在读的,索引 + 总览 |
| `CLAUDE.md` | Claude Code | 强约束,跟代码同步更新 |
| `docs/architecture.md` | 架构 / 后端 | 模块划分 / 数据三层 / 协议 / Schema 草案 |
| `docs/agent-protocol.md` | 爬虫开发 / 后端 | Agent ↔ 中台 HTTP 协议契约 |
| `docs/agent-setup-guide.md` | 运维 / 部署 | 从拿 token 到 Windows 任务计划程序的完整操作 |
| `docs/ui-conventions.md` | 前端 | shadcn 封装规则 / 筛选条 / 表单控件 |
| `agent-reference/README.md` | 爬虫机运维 | 同目录下 Python 参考实现的部署手册 |

---

## 反馈 / 提交

提交前 checklist:
- [ ] `pnpm typecheck` 干净
- [ ] `pnpm test` 通过
- [ ] 改了 UI 跑过 dev 浏览器实测
- [ ] 改了 schema → migration 在干净 DB 上能从 0 跑通

PR 描述说清:**改了什么**、**为什么**、**怎么验证**。
