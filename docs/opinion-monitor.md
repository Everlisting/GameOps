# 舆情监控(阶段 9)· 落地设计文档

> 版本:v0.1 · 集成 `F:\Kaifa\slg_analyzer` 到 GameOps 运营后台
>
> 目标:让运营在中台看到 slg_analyzer 生成的三类舆情报告(私域 / 公域 / 对比),ADMIN 可在 UI 触发生成,OPERATOR 只读。

---

## 0. 关键决策(讨论结论)

| # | 决策 | 说明 |
|---|---|---|
| 触发方式 | ADMIN 点按钮触发 | OPERATOR 只能查看列表 + 查看报告 |
| 输入来源 | 手动 UI 上传 | 私域/公域各上传一个文件,单文件上限 **50 MB** |
| 部署形态 | **本地 Docker 容器** | 现阶段用 docker-compose 起 `analysis` 容器,以后原样迁阿里云 |
| 通信 | **HTTP** | 中台 fetch 分析服务,Bearer token 鉴权,**不复用** Agent 拉取协议 |
| 报告存储 | **回传中台落盘**(方案 Q2-b) | 走中台鉴权路由,不进 `public/` |
| 状态模型 | **异步 + 前端轮询**(5s) | `PENDING / RUNNING / DONE / FAILED` |
| 元数据 | **只落分析服务侧 SQLite**,中台不建 `OpinionReport` 表 | 中台代理拉列表,自身仅存 LLM 设置 |
| LLM 配置 | 全局一份,存中台 `OpinionSettings` 单行表,`apiKey` 走 **AES 加密** | ADMIN 可改;`provider ∈ {anthropic, openai, echo}`;`apiKey` 必填 |
| 报告绑定 | **不绑活动、不绑游戏** | 全站共享,`game` 字段仅作报告标题 |
| 历史/趋势 | 暂不做 | 只列表 + 查看,不做跨报告的时间序列 |
| 报告查看 | 跳新页面,**不用 iframe** | 中台鉴权路由 stream 原始 HTML |
| 权限 | OPERATOR 只读 / ADMIN 全权 | 触发/删除/重跑/改设置 全部 ADMIN |
| 保留期 | **永久** | 只有 ADMIN 手动删除,不做自动清理 |

---

## 1. 组件拓扑

```
                                       ┌──────────────────────────────┐
                                       │  Docker 容器: analysis:8000  │
                                       │  FastAPI wrapper of          │
                                       │  slg_analyzer                │
   浏览器 (ADMIN/OPERATOR)              │  ├── run.py                  │
       │                                │  ├── run_public.py           │
       │  ①上传/触发/列表/查看          │  ├── run_combined.py         │
       ▼                                │  ├── SQLite: tasks.db        │
   ┌──────────────────────┐   ②HTTP     │  └── volume: /data/output/   │
   │  中台 Next.js:3000   │◄───────────▶│                              │
   │  app/operator/opinion│  Bearer     │  持有 LLM API Key            │
   │  app/api/opinion/*   │  Token      │  (由中台通过 API 下发)       │
   │  storage/opinion-    │             └──────────────────────────────┘
   │    reports/<taskId>/ │
   │  Prisma:             │◄─── ③完成后中台后台 worker
   │    OpinionSettings   │      pull HTML+JSON 回本地
   │    AuditLog          │
   └──────────────────────┘
```

- **中台不持有 LLM key 的明文**:AES 加密后存 DB,分析服务从中台 API 领,或每次触发时中台随请求头带下去(推荐后者,避免分析服务持久化密钥)。
- **分析服务是无状态可重启的**(除了 SQLite + volume),中台 down 了不影响正在跑的任务。

---

## 2. 数据流

### 2.1 触发私域 / 公域(单文件上传)

```
浏览器           中台 /api/opinion/tasks/private          分析服务 /tasks/private
   │  multipart (file + game + coverageSpan)  │                     │
   ├────────────────────────────────────────► │  ①requireRole ADMIN │
   │                                          │  ②Zod 校验(<=50MB) │
   │                                          │  ③decrypt apiKey    │
   │                                          │  ④forward multipart │
   │                                          ├────────────────────►│
   │                                          │                     │  ①落 SQLite (PENDING)
   │                                          │                     │  ②保存 input 到 volume
   │                                          │                     │  ③入线程池
   │                                          │◄────────────────────┤  { taskId }
   │                                          │  ⑤AuditLog          │
   │◄────────── { taskId }────────────────────┤                     │
   │                                          │                     │
   │  轮询 GET /api/opinion/tasks/{id} (5s)   │                     │
   ├────────────────────────────────────────► ├────────────────────►│
   │                                          │◄────────────────────┤  { status, ... }
   │◄─────────── status ──────────────────────┤                     │
   │                                          │                     │
   │                            RUNNING → DONE 后中台后台 worker    │
   │                            自动 GET /tasks/{id}/html + /json   │
   │                            落 storage/opinion-reports/<id>/    │
   │                                                                │
   │  status=DONE 后 UI 显示 "查看报告" 链接                        │
   │  → 新页面 /operator/opinion/reports/<id>/view                  │
```

### 2.2 触发对比

- 前端两个 Select 分别从**分析服务已完成的私域列表**和**公域列表**里挑,默认各选最新
- 中台收到 `{ privateTaskId, publicTaskId }`,forward 给分析服务的 `POST /tasks/combined`
- 分析服务用自己 SQLite 里的两份 JSON 文件路径调 `run_combined.analyze_combined()`

---

## 3. 分析服务 API 契约

**Base**:`http://localhost:8000`(dev),生产由 compose 内网 DNS 走 `http://analysis:8000`

**鉴权**:所有接口带 `Authorization: Bearer <ANALYSIS_SHARED_SECRET>`,值由 `.env` 注入,中台/分析服务两侧同源。

**LLM 配置头**:每次触发类接口(`POST /tasks/*`)必须带下面 4 个 header,分析服务临时使用,不持久化。

```
X-LLM-Provider: anthropic | openai | echo
X-LLM-Model:    <model name>
X-LLM-ApiKey:   <decrypted plain text>
X-LLM-BaseUrl:  <optional>
```

### 3.1 触发接口

| Method | Path | Content-Type | 请求 | 响应 |
|---|---|---|---|---|
| POST | `/tasks/private` | `multipart/form-data` | `file`(必填,`.json/.csv/.xlsx`) + `game`(默认"率土之滨") + `coverageSpan`(可选) + `createdBy`(username 快照) | `201 { taskId, status: "PENDING" }` |
| POST | `/tasks/public`  | `multipart/form-data` | 同上,`file` 是 `social_*.json` | 同上 |
| POST | `/tasks/combined` | `application/json` | `{ privateTaskId, publicTaskId, game?, createdBy }` | 同上 |

### 3.2 查询接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/tasks?scope=private\|public\|combined&status=&limit=100&offset=0` | 列表,返回元数据数组,按 createdAt DESC |
| GET | `/tasks/{id}` | 详情 |
| GET | `/tasks/{id}/html` | 返回原始 HTML(`Content-Type: text/html; charset=utf-8`) |
| GET | `/tasks/{id}/json` | 返回原始 JSON |
| GET | `/tasks/{id}/input` | 返回原始上传文件(仅 private/public,供 combined 复用时定位) |

### 3.3 变更接口

| Method | Path | 说明 |
|---|---|---|
| POST | `/tasks/{id}/rerun` | 用相同输入 + 相同 LLM 配置重跑,克隆出一个新 taskId(参考现有 CrawlerTask.requeue 语义) |
| DELETE | `/tasks/{id}` | 删任务 + volume 上的所有产物 + SQLite 行 |

### 3.4 Task 元数据 schema

```json
{
  "taskId": "opn_<ulid>",
  "scope": "private | public | combined",
  "status": "PENDING | RUNNING | DONE | FAILED",
  "game": "率土之滨",
  "coverageSpan": "2026-06-02 ~ 2026-06-03",
  "createdBy": "admin",
  "createdAt": "2026-07-01T10:30:00Z",
  "startedAt": "2026-07-01T10:30:12Z",
  "finishedAt": "2026-07-01T10:31:45Z",
  "durationMs": 93000,
  "errorMessage": null,
  "artifacts": {
    "html": "/data/output/opn_xxx/report.html",
    "json": "/data/output/opn_xxx/report.json"
  },
  "parents": {
    "privateTaskId": "opn_aaa",
    "publicTaskId":  "opn_bbb"
  }
}
```

### 3.5 错误契约

- `400` 参数错(zod 校验、文件超限、combined 引用的父 task 不存在或未 DONE)
- `401` Bearer 缺失或不匹配
- `404` taskId 不存在
- `409` task 状态不允许该操作(如 DELETE 一个 RUNNING 的)
- `422` LLM 配置头缺失或空
- `500` 内部错误,body 里带 `detail`
- 所有响应 body:`{ error: { code, message, hint? } }`

---

## 4. 中台 API 契约

### 4.1 前缀 `/api/opinion/*`

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/opinion/tasks/private` | ADMIN | `multipart`,forward 到分析服务,写 `opinion.trigger` 审计 |
| POST | `/api/opinion/tasks/public` | ADMIN | 同上 |
| POST | `/api/opinion/tasks/combined` | ADMIN | `application/json`,forward |
| GET | `/api/opinion/tasks?scope=&status=&limit=` | OPERATOR+ | 代理分析服务 `/tasks` |
| GET | `/api/opinion/tasks/[id]` | OPERATOR+ | 代理详情 |
| POST | `/api/opinion/tasks/[id]/rerun` | ADMIN | 代理 rerun,审计 `opinion.rerun` |
| DELETE | `/api/opinion/tasks/[id]` | ADMIN | 代理删除 + 删中台 storage/opinion-reports/[id]/,审计 `opinion.delete` |
| GET | `/api/opinion/settings` | ADMIN | 读 LLM 设置,**apiKey 打码返回**(如 `sk-****abcd`) |
| PUT | `/api/opinion/settings` | ADMIN | 更新 LLM 设置,`apiKey` 必填(非空字符串),写 `opinion.settings.update` 审计 |

### 4.2 报告展示路由(**不在 /api/ 下**,是 Route Handler 直吐 HTML)

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/operator/opinion/reports/[taskId]/view` | OPERATOR+ | 读 `storage/opinion-reports/[taskId]/index.html` 返回给浏览器;404 若产物尚未回传 |
| GET | `/operator/opinion/reports/[taskId]/data.json` | OPERATOR+ | 同上,返回 JSON(供调试/二次加工) |

**为什么不用 `/api/`?** — HTML 展示需要浏览器直接打开、跳新 tab,`/api/` 前缀习惯上是 fetch。放 `/operator/opinion/reports/*` 走同一个 Route Handler,权限走 `requireRole("OPERATOR")`。

---

## 5. 数据模型

### 5.1 中台侧(Prisma)

**只新增一张表**:

```prisma
/// 舆情监控 · LLM 全局配置(单行:id=1)
model OpinionSettings {
  id          Int      @id @default(1)           // 单例锁,只允许 id=1
  provider    String                              // "anthropic" | "openai" | "echo"
  model       String                              // 如 "claude-sonnet-4-5" / "gpt-4o"
  apiKeyEnc   String                              // AES-256-GCM 密文,base64 编码
  apiKeyMask  String                              // "sk-****abcd" 给前端展示用
  baseUrl     String?                             // OpenAI 兼容端点
  updatedBy   String                              // username 快照
  updatedAt   DateTime @updatedAt

  @@map("opinion_settings")
}
```

初始行由 `prisma/seed.ts` 插入:`provider="echo"`, `model="echo"`, `apiKeyEnc=""`, `apiKeyMask="<未配置>"`。**未配置状态下 UI 上"触发生成"按钮禁用并提示"请先到管理员设置里配置模型"**。

**AuditLog 复用现有表**,新增 action:

- `opinion.trigger`(target: `opinion_task`, targetId=`taskId`,details 含 `scope / game / inputFileName`)
- `opinion.rerun`
- `opinion.delete`
- `opinion.settings.update`(target: `opinion_settings`,details 含变化前后的 `provider / model / apiKeyMask` 但不含明文)

### 5.2 分析服务侧(SQLite)

```sql
CREATE TABLE tasks (
  task_id       TEXT PRIMARY KEY,        -- opn_<ulid>
  scope         TEXT NOT NULL,           -- private | public | combined
  status        TEXT NOT NULL,           -- PENDING | RUNNING | DONE | FAILED
  game          TEXT NOT NULL,
  coverage_span TEXT,
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,        -- unix ms
  started_at    INTEGER,
  finished_at   INTEGER,
  error_message TEXT,
  input_path    TEXT,                    -- volume 相对路径
  html_path     TEXT,
  json_path     TEXT,
  parent_private TEXT,                   -- combined 才有
  parent_public  TEXT
);
CREATE INDEX idx_tasks_scope_created ON tasks(scope, created_at DESC);
CREATE INDEX idx_tasks_status ON tasks(status);
```

### 5.3 中台 storage 目录约定

```
F:\Kaifa\GameOps\storage\opinion-reports\
├── opn_01hxyz...\
│   ├── index.html         # 从分析服务拉回来的 HTML
│   ├── data.json          # 从分析服务拉回来的 JSON
│   └── meta.json          # { taskId, scope, game, coverageSpan, downloadedAt }
└── ...
```

**gitignore**:整个 `storage/` 目录进 `.gitignore`。

**权限**:此目录由中台进程写,任何 HTTP 路径都要过 `requireRole("OPERATOR")` 才能读。

---

## 6. LLM 配置面板 · UI 契约

路径:`/operator/opinion/settings` (ADMIN only,middleware 不额外拦,页面 `requireRole("ADMIN")`)

字段:

| 字段 | 类型 | 校验 | 说明 |
|---|---|---|---|
| provider | Select | ∈ `{anthropic, openai, echo}` | echo = 离线规则模式 |
| model | Input | 非空,`<=64` 字符 | anthropic 默认 `claude-sonnet-4-5`,openai 默认 `gpt-4o`,echo 默认 `echo` |
| apiKey | Password input | **非空**,`<=200` 字符 | 保存时 AES 加密;显示时打码 `sk-****abcd` |
| baseUrl | Input | 可空,URL 格式 | OpenAI 兼容端点(如 `https://api.deepseek.com/v1`) |

- 表单只允许 ADMIN 提交(前端隐藏 + 后端 `requireRole("ADMIN")` 双兜底)
- 保存成功后前端不回显明文 apiKey,只回显新的 mask
- `echo` 模式下 apiKey **仍然必填**(不特判,保持状态机简单;值不会真的被 slg_analyzer 使用)

---

## 7. Docker 部署清单

### 7.1 docker-compose 追加片段

```yaml
# F:\Kaifa\GameOps\docker-compose.yml 或独立的 compose 文件
services:
  analysis:
    build:
      context: ../slg_analyzer/service
      dockerfile: Dockerfile
    image: gameops/opinion-analysis:latest
    container_name: gameops-opinion-analysis
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"   # 只绑本机,避免公网暴露
    environment:
      - ANALYSIS_SHARED_SECRET=${ANALYSIS_SHARED_SECRET}
      - TZ=Asia/Shanghai
    volumes:
      - opinion_data:/data      # tasks.db + output 都落这里
volumes:
  opinion_data:
```

### 7.2 中台 `.env` 追加

```ini
# 舆情监控 · 分析服务
ANALYSIS_BASE_URL=http://127.0.0.1:8000
ANALYSIS_SHARED_SECRET=<32 字节 hex>

# 舆情监控 · AES 主密钥(用于加密 apiKey)
OPINION_AES_KEY=<32 字节 base64>
```

生成命令:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"       # ANALYSIS_SHARED_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"    # OPINION_AES_KEY
```

### 7.3 分析服务 Dockerfile 骨架

```
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt requirements-service.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-service.txt
COPY src ./src
COPY run.py run_public.py run_combined.py ./
COPY service ./service
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 8. 目录变更

### 8.1 slg_analyzer 侧(新增)

```
slg_analyzer/
├── service/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── config.py            # env 读取(secret / data dir)
│   ├── db.py                # SQLite 封装
│   ├── tasks.py             # 任务队列(concurrent.futures ThreadPoolExecutor)
│   ├── runner.py            # 调 run/run_public/run_combined 的胶水
│   ├── auth.py              # Bearer 校验
│   └── schemas.py           # pydantic 请求/响应模型
├── requirements-service.txt # fastapi, uvicorn, python-multipart, pydantic
├── Dockerfile
└── .dockerignore
```

**不动** `run.py / run_public.py / run_combined.py / src/`,service 层直接 `import` 其内部函数(`analyze / analyze_public / analyze_combined + render_*`)。

### 8.2 中台侧(新增)

```
GameOps/
├── app/
│   ├── api/opinion/
│   │   ├── tasks/private/route.ts
│   │   ├── tasks/public/route.ts
│   │   ├── tasks/combined/route.ts
│   │   ├── tasks/route.ts
│   │   ├── tasks/[id]/route.ts
│   │   ├── tasks/[id]/rerun/route.ts
│   │   └── settings/route.ts
│   └── operator/
│       └── opinion/
│           ├── _components/
│           │   ├── TriggerDialog.tsx
│           │   ├── TaskListTable.tsx
│           │   └── StatusBadge.tsx
│           ├── private/page.tsx
│           ├── public/page.tsx
│           ├── combined/page.tsx
│           ├── settings/page.tsx
│           └── reports/[taskId]/
│               ├── view/route.ts       # stream index.html
│               └── data.json/route.ts  # stream data.json
├── lib/
│   ├── crypto.ts              # AES-256-GCM 加解密
│   ├── opinion/
│   │   ├── client.ts          # 封装 fetch 分析服务
│   │   ├── downloader.ts      # 后台 worker:拉 DONE 产物落盘
│   │   ├── storage.ts         # storage 路径帮手
│   │   └── settings.ts        # 读写 OpinionSettings + 加解密
│   └── validation/opinion.ts  # Zod schemas
├── storage/                   # .gitignore
│   └── opinion-reports/
└── docs/opinion-monitor.md    # 本文档
```

### 8.3 后台 worker 启动

- 复用现有 `lib/cron-scheduler.ts` 的启动入口(如果有 bootstrap 文件),否则在 `app/api/opinion/*` 首次被调用时 lazy 起 `setInterval`
- 频率:每 10s 扫一次 `分析服务 GET /tasks?status=DONE`,对每个未在 `storage/opinion-reports/` 目录里的 taskId,拉 html+json 落盘
- 幂等:只看目录是否已存在 `index.html`

---

## 9. 权限矩阵

| 动作 | Route | OPERATOR | ADMIN | 未登录 |
|---|---|---|---|---|
| 打开 `/operator/opinion/*` 列表页 | 页面 | ✅ | ✅ | ❌(middleware 拦) |
| 查看单份报告 HTML | `/operator/opinion/reports/[id]/view` | ✅ | ✅ | ❌ |
| 触发生成 | `POST /api/opinion/tasks/*` | ❌ 403 | ✅ | ❌ |
| 重跑 | `POST .../rerun` | ❌ 403 | ✅ | ❌ |
| 删除 | `DELETE .../tasks/[id]` | ❌ 403 | ✅ | ❌ |
| 查看 LLM 设置 | `/operator/opinion/settings` | ❌ 页面跳 403 | ✅ | ❌ |
| 修改 LLM 设置 | `PUT /api/opinion/settings` | ❌ 403 | ✅ | ❌ |

Sidebar 在 OPERATOR 视角:三个列表页可见,**"模型设置"隐藏**(和现有 ADMIN_NAV_ITEMS 处理一致)。

---

## 10. 审计事件汇总

| Action | Actor | TargetType | TargetId | details JSON |
|---|---|---|---|---|
| `opinion.trigger` | ADMIN | `opinion_task` | `taskId` | `{ scope, game, coverageSpan, inputFileName, provider, model }` |
| `opinion.rerun` | ADMIN | `opinion_task` | 新 `taskId` | `{ fromTaskId, scope, game }` |
| `opinion.delete` | ADMIN | `opinion_task` | `taskId` | `{ scope, game, status }` |
| `opinion.settings.update` | ADMIN | `opinion_settings` | `1` | `{ before: {provider, model, apiKeyMask, baseUrl}, after: {同左} }` |

---

## 11. 错误处理与边界

| 场景 | 行为 |
|---|---|
| 用户上传 > 50MB 文件 | 中台 API 层 413,前端 toast 提示 |
| 用户上传非 `.json/.csv/.xlsx` | 中台 400,前端表单校验兜底 |
| LLM 配置未初始化(apiKeyEnc="") | 触发按钮 disabled,tooltip 提示"请先到设置里配置模型" |
| 分析服务 down / 超时 | 前端触发时 5xx,列表页显示"分析服务不可达"横幅 |
| 报告生成失败(FAILED) | 列表项显示错误摘要,ADMIN 有 "重跑" 按钮 |
| 后台 worker 拉产物失败 | 记 `console.error`,下一轮扫再重试;不影响列表展示 |
| 组合报告引用的父 task 已被删 | 分析服务 409,中台前端表单校验时应过滤已删的父 task |
| SQLite 或 volume 损坏 | 认定为致命,人工介入(与现有 DB 一致对待) |

---

## 12. 非目标(明确 out-of-scope)

- ❌ **报告的深度对比 / 时间序列图表**:不在阶段 9 范围
- ❌ **多游戏切换**:一份报告一个 `game` 字段,不做 workspace
- ❌ **自动定时生成**:不接 cron,不接飞书通知(留给后续阶段)
- ❌ **从现有 RawDataset 拉输入**:阶段 9 只做手动上传;将来打通抖音/B 站 Job 产物再说
- ❌ **爬虫机 Agent 集成**:分析服务是独立 HTTP 服务,不走 Agent 拉取队列
- ❌ **HTML 报告的解构**:直接原样吐 HTML,不用 shadcn 复刻页面

---

## 13. 落地步骤(与 TaskList 对应)

| # | 步骤 | 产物 |
|---|---|---|
| 1 | 本文档 | `docs/opinion-monitor.md`(review 后落地) |
| 2 | Prisma 加 `OpinionSettings` + `lib/crypto.ts` + migrate + seed | schema + migration + 单元测试 |
| 3 | slg_analyzer 加 `service/` + Dockerfile + docker-compose 片段 | 分析服务本地可跑 |
| 4 | 中台 API 代理层 + Zod + AuditLog | `app/api/opinion/*` |
| 5 | 后台 worker 拉产物 | `lib/opinion/downloader.ts` |
| 6 | Sidebar + 4 个页面 + 触发对话框 + 状态轮询 | 私域/公域/对比/设置 |
| 7 | 鉴权路由 stream HTML | `/operator/opinion/reports/[id]/view` |
| 8 | 更新 CLAUDE.md 阶段 9,typecheck+test 全过 | 阶段收尾 |

---

## 14. 遗留 / 未来扩展

- 自动定时报告 + 飞书推送(可复用阶段 6 的 cron + webhook)
- 复用 CrawlerJob 拉抖音/B 站/小红书数据作为公域输入
- 多游戏 workspace 或 `game` 字段可选值受管理员维护
- 报告的关键指标提取入 DB → 支持"温度计随时间"折线
- 分析服务扩为可水平扩展(把 SQLite 换成中台 PG + 分析服务改无状态 worker)
