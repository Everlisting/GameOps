# 日志系统设计方案（修订版）

> 状态：**阶段1(core)+ 阶段2(接入)已实现并通过端到端测试;阶段3 部署接入见 `docs/logging-deploy.md`;阶段4/5 暂不做(§18)**。
>
> 适用范围：Next.js 14 App Router + Prisma + 进程内 worker + 爬虫 Agent + Python 分析服务 + 阿里云 ECS/PM2 单实例部署。
>
> 修订目标：建立可检索、可关联、默认安全的应用运行日志，同时避免多重存储、递归告警、凭证泄露和“异步即可靠”等常见问题。

---

## 0. 定位：三类日志保持独立

| 层 | 记录内容 | 当前存储 | 本方案处理 |
|---|---|---|---|
| **审计日志** `AuditLog` | 谁在何时对什么做了什么 | PostgreSQL | 保持独立，不并入运行日志 |
| **任务执行日志** `data/logs` | 爬虫子进程 stdout/stderr | `data/logs/<taskId>.log` | 保持独立，继续按 taskId 查询和清理 |
| **应用运行日志** | HTTP、worker、外部调用、错误、性能 | 散落 `console.*` | 新建统一结构化日志 |

核心原则：

- 审计日志服务于业务追责与合规，运行日志服务于开发和运维排障。
- Task 执行日志可能包含大量脚本输出，不进入应用日志和 PostgreSQL。
- 运行日志默认只写一个主出口，避免 stdout、应用文件、PM2 文件和 SLS 重复采集。
- 日志系统故障不能拖垮业务，但必须能观察到日志丢弃、队列溢出和 sink 故障。

---

## 1. 目标与非目标

### 1.1 目标

1. 用统一 JSON schema 记录 Node、Edge 和 Python 服务日志。
2. 能按 `requestId` 查询一次 HTTP 请求，按业务 ID 查询跨请求长流程。
3. 默认不记录凭证、请求体、Cookie、完整请求头和个人敏感信息。
4. 生产日志进入阿里云同地域 SLS，支持检索、看板和告警。
5. fatal、数据库不可用、飞书不可用、磁盘满等故障下不会形成递归日志或告警风暴。
6. 对日志量、采样、保留期和费用设明确边界。

### 1.2 非目标

- 第一阶段不引入完整 OpenTelemetry、分布式追踪平台和自建 Loki/Grafana。
- 不用 PostgreSQL 保存 access log、debug log 或全部运行日志。
- 不在日志中保存可还原的聊天内容、请求体、上传文件内容和模型提示词。
- logger 不负责业务重试，也不改变现有 AuditLog、Task 和 worker 的执行语义。

---

## 2. 推荐架构

```text
Node 应用 / Edge middleware / Python 分析服务
                    │
                    │ 统一 JSON Lines schema
                    ▼
              stdout / stderr
                    │
                    ▼
          PM2 日志文件（本地缓冲）
                    │
                    ▼
      阿里云 Logtail → 同地域 SLS
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
       检索/看板           SLS 侧告警

可选增强（不是主链路）：
显式高价值 error/fatal → 有界隔离队列 → ErrorLog 表 → ADMIN 查询页
```

### 2.1 主链路

- Node 侧使用 **pino** 输出结构化 JSON。
- 开发环境可用 `pino-pretty`，生产环境只输出单行 JSON。
- 应用本身不再维护一套 `storage/logs/app-*.log`。
- PM2 承接 stdout/stderr 本地缓冲和轮转，Logtail 只采集这一份文件。
- SLS 是生产全量检索、聚合和告警入口。

### 2.2 为什么不默认启用多 transport

同时写 stdout、应用文件、数据库、飞书和 SLS 会带来：

- 同一条日志被 PM2 和应用文件重复保存、重复采集。
- DB sink 失败时重新触发 DB 日志，形成递归。
- 飞书告警失败时再次产生 error 并再次告警。
- 多个异步队列在进程退出时存在不同程度的数据丢失。

因此主 logger 默认只有 stdout/stderr；数据库和应用内告警均为后续可选、隔离的派生能力。

---

## 3. 统一日志 schema

每行一条 JSON，Node、Edge、Python 字段含义一致：

```jsonc
{
  "schemaVersion": 1,
  "ts": "2026-07-28T08:15:30.123Z",
  "level": "info",
  "service": "gameops-web",
  "environment": "production",
  "release": "git-sha-or-version",
  "instanceId": "host/process identifier",

  "module": "agent.task",
  "event": "agent.task.result_received",
  "msg": "Agent 已回传任务结果",

  "requestId": "019...",
  "traceId": "019...",

  "taskId": "cuid...",
  "jobId": "cuid...",
  "agentId": "cuid...",
  "opinionTaskId": "external-task-id",
  "runId": "ai-run-id",
  "conversationId": "conversation-id",

  "userIdHash": "hmac...",
  "chatIdHash": "hmac...",
  "role": "OPERATOR",

  "method": "POST",
  "route": "/api/agent/tasks/:id/result",
  "status": 200,
  "durationMs": 128,

  "err": {
    "name": "Error",
    "message": "已脱敏且已限长",
    "code": "ECONNRESET",
    "stack": "已脱敏且已限长"
  },

  "fields": {}
}
```

### 3.1 必填字段

所有日志必须包含：

- `schemaVersion`
- `ts`：UTC ISO 8601
- `level`
- `service`
- `environment`
- `module`
- `event`
- `msg`

生产环境还应包含 `release` 和 `instanceId`，用于判断错误来自哪个版本和进程。

### 3.2 ID 语义

| 字段 | 生命周期 | 用途 |
|---|---|---|
| `requestId` | 一次 HTTP 请求 | 查询单次请求入口、业务调用和响应 |
| `traceId` | 一次逻辑处理链 | 飞书单条消息、一次 worker tick 等不完全等同 HTTP 的流程 |
| `taskId` | 一次 CrawlerTask 执行 | 关联触发、领取、多次日志上传和结果回传 |
| `opinionTaskId` | 一次分析服务任务 | 关联触发、轮询、下载和报告查看 |
| `runId` | 一次 AI 助手运行 | 关联流式输出、工具调用和最终状态 |

`requestId` 不能代替 `taskId` 等持久业务 ID。不同时间发生的 `/claim`、`/log`、`/result` 请求各有自己的 requestId，但共享 taskId。

### 3.3 logger API

对 pino 再包一层项目 API，固定调用顺序并自动规范化错误：

```ts
const log = createLogger("agent.task");

log.info("Agent 已领取任务", {
  event: "agent.task.claimed",
  taskId,
  agentId,
});

log.error("任务结果处理失败", {
  event: "agent.task.result_failed",
  taskId,
  err,
  persist: true,
});
```

`persist` 属于 logger 上下文契约：

- 仅 `error/fatal` 可以设置。
- `fatal` 和未预期 5xx 默认视为 `persist: true`。
- 只有启用可选 ErrorLog sink 时才生效。
- 不能由客户端传入。

---

## 4. 上下文传播

### 4.1 HTTP API

`lib/api.ts` 的 `route()` 是 API requestId 的权威入口：

1. 校验可信反向代理传入的 `x-request-id`；不可信、超长或格式非法则重新生成。
2. 使用 `AsyncLocalStorage` 保存 requestId、用户、角色和规范化 route。
3. 返回响应头 `x-request-id`。
4. 默认只记录一条完成日志，避免入口、出口各一条造成翻倍。
5. 对流式响应额外记录 `stream.completed` 或 `stream.failed`，普通 handler 返回耗时不能冒充完整流耗时。

请求 ID 建议采用 UUID/UUIDv7 或其他固定长度随机 ID，只接受字母、数字、`-`、`_`，并限制最大长度。

### 4.2 middleware

当前 middleware matcher 不覆盖 `/api/*`，所以它不负责 API 的 requestId。

middleware 仅记录少量必要事件：

- 未登录访问受保护页面。
- 角色错配跳转。
- 会话校验异常。

middleware 使用 Edge-safe logger，不导入 pino、Prisma、argon2 或 Node 文件模块。若需要把 requestId 传入后续页面请求，必须使用 Next.js 支持的 request headers 传播方式，并同时写入响应头。

### 4.3 Crawler Agent

Agent 是“主动轮询中台”的拉模型，中台不会主动连接 Agent：

```text
运营触发请求(requestId=A)
  └─ 创建 taskId=T

Agent /claim(requestId=B)
  └─ 返回 taskId=T

Agent /log(requestId=C, taskId=T)
Agent /log(requestId=D, taskId=T)
Agent /result(requestId=E, taskId=T)
```

排查完整执行过程以 `taskId` 为主，以各 requestId 为辅。若未来确实需要从“运营点击触发”追到最终结果，可在 Task 中增加 `originRequestId`；这属于数据模型变更，实施时按 Prisma migration 流程执行。

Agent 自身日志也应输出相同 schema，并至少包含 `service=crawler-agent`、`agentId`、`taskId`、`event`。

### 4.4 Python 分析服务

中台调用分析服务时：

- 透传经过校验的 `x-request-id`。
- 触发成功后以后续 `opinionTaskId` 作为长流程主键。
- Python 服务日志使用相同字段和 UTC 时间。
- 不记录 `Authorization`、`X-LLM-ApiKey`、上传文件名以外的文件内容。

### 4.5 worker 和流式回调

- cron、downloader、indexer 每次 tick 生成 traceId。
- 已有业务 ID 时同时记录 jobId、taskId、opinionTaskId、runId。
- 流式响应的 `onFinish/onError`、`void` 后台 Promise 必须捕获创建时的 child logger，不能假设 Response 返回后 ALS 一定仍然存在。
- instrumentation 注册 logger handler、cron 和 worker 时必须幂等，避免开发热更新或重复 register。

---

## 5. 日志级别与事件策略

| 级别 | 使用场景 |
|---|---|
| `trace` | 极细粒度诊断，生产默认关闭 |
| `debug` | 查询采样、内部状态、开发排障 |
| `info` | 启停、任务状态变化、正常外部调用、请求完成 |
| `warn` | 可恢复降级、慢查询、限流、异常但预期的业务状态 |
| `error` | 未预期失败、5xx、任务处理失败 |
| `fatal` | 进程无法安全继续运行 |

### 5.1 HTTP 级别

- 2xx/3xx：`info`，高频接口可采样。
- 普通 404、参数校验失败：`info` 或采样后的 `warn`，避免把用户输入错误当系统故障。
- 401/403：根据频率和来源采样；短期大量出现时由 SLS 聚合告警。
- 409 等正常业务冲突：`warn` 或 `info`。
- 未预期 5xx：`error`。

Agent `/claim` 空队列、运行中每 5 秒空 `/log`、健康检查等高频成功请求必须降噪，不能逐条以 info 全量保存。

### 5.2 fatal 处理

- `uncaughtException` 和无法安全恢复的 `unhandledRejection` 记录为 fatal。
- fatal 首先直接写 stderr，再对异步 sink 做有界 flush。
- flush 到达超时后无论是否成功都退出，由 PM2 拉起。
- 不支持“记录 fatal 后继续运行”的可选模式。

---

## 6. 默认安全：字段白名单优先

### 6.1 永不记录

- `Cookie`、`Set-Cookie`
- 完整 `Authorization`
- JWT、Session cookie、Agent token、内部 Bearer secret
- `X-LLM-ApiKey`、模型供应商 API key
- 飞书 webhook URL、AppSecret、Verification Token、EncryptKey
- 密码、密码哈希、AES key、加密前后的凭证对象
- 完整 headers、完整 query、请求体、FormData、上传文件内容
- AI 提示词、完整用户消息、完整模型回复
- Excel/CSV 参数数组、审计 `details` 整对象

### 6.2 允许记录的 HTTP 字段

- method
- 规范化 route 模板，不记录带敏感参数的原始 URL
- status
- durationMs
- request/response content length
- 必要时记录 User-Agent 类别，不记录无限长原串

### 6.3 双层防护

1. **序列化白名单**：HTTP、Error、Prisma、外部调用分别使用专用 serializer，只挑允许字段。
2. **递归兜底脱敏**：对最终 LogRecord 的键和值再扫描。

键名匹配必须：

- 大小写不敏感。
- 忽略 `-`、`_` 等差异。
- 递归处理嵌套对象和数组。
- 覆盖 `authorization`、`x-llm-api-key`、`apiKey`、`token`、`secret`、`password`、`cookie`、`*Enc` 等。

值模式兜底至少覆盖手机号、邮箱、JWT、Bearer、常见 API key、飞书 webhook URL。值模式只是兜底，不能替代白名单。

### 6.4 标识符去身份化

- 默认不记录用户名、手机号、邮箱。
- userId/chatId 如需聚合，使用独立 `LOG_HASH_SECRET` 做 HMAC，输出 `userIdHash/chatIdHash`。
- `LOG_HASH_SECRET` 未配置时直接省略这些字段，不能退回明文。
- HMAC 密钥轮换会改变聚合值，轮换策略需要记录但不能把密钥写入日志。

### 6.5 大小限制

建议默认限制：

- 单条日志序列化后不超过 32 KB。
- 普通字符串不超过 2 KB。
- error message 不超过 4 KB。
- stack 不超过 16 KB。
- 数组最多保留 20 项。
- 对象最大递归深度为 6。

超限字段截断并增加 `truncated: true`，避免一次异常把大文件、模型响应或 Excel 数组写入日志。

---

## 7. 接入点

| 接入点 | 记录策略 |
|---|---|
| `route()` | requestId、规范化 route、status、duration；未预期错误带安全 Error |
| middleware | 仅鉴权失败、角色分流和校验异常 |
| streaming API | handler 接受请求与 stream 最终完成/失败分开记录 |
| cron scheduler | 注册、取消、触发、失败；带 jobId/taskId/traceId |
| Agent API | claim/log/result；带 agentId/taskId，心跳和空轮询降噪 |
| opinion downloader | 每次 tick、单任务拉取结果；带 opinionTaskId |
| knowledge indexer | 文档处理状态；只记 documentId，不记文档正文 |
| 飞书双向对话 | 收到、生成、回发阶段；只记 chatIdHash/traceId，不记消息正文 |
| AI 助手 | runId、模型、token 用量、耗时、工具名；不记提示词和完整回复 |
| 外部 HTTP | service、operation、status、duration、供应商错误码 |
| Prisma | error、慢查询和受控 debug 采样；不记录 params |
| 未捕获异常 | fatal、stderr、有界 flush、退出 |

CLI 评测脚本可继续使用 console 作为终端输出；`no-console` 只约束应用代码，并为 Edge bootstrap logger 和 logger 自身设置明确例外。

---

## 8. Prisma 日志安全边界

生产默认策略：

- Prisma `error/warn` 进入 logger。
- 超过 `LOG_SLOW_QUERY_MS` 的查询记 `warn`。
- 普通成功查询默认不记录；临时排障时才按比例输出 debug。
- 永不记录 query params。
- raw SQL 不记录插值后的 SQL，只记录规范化模板或 fingerprint。
- 慢查询不采样，普通 debug 查询才采样。

推荐字段：

```jsonc
{
  "module": "db",
  "event": "db.query.slow",
  "durationMs": 820,
  "model": "CrawlerTask",
  "operation": "findMany",
  "queryFingerprint": "sha256...",
  "requestId": "..."
}
```

实施前必须通过测试验证 Prisma event/extension 能否稳定继承 ALS。若不能，就只记录数据库级慢查询，不伪造 requestId 关联；需要精确关联的关键查询应在调用边界测量。

---

## 9. sink 隔离与可靠性

### 9.1 bootstrap logger

提供一个只会同步写 stderr 的最小 bootstrap logger，用于：

- logger 初始化失败。
- redaction/serializer 自身异常。
- DB sink 写入失败。
- 告警 sink 发送失败。
- fatal flush 失败。

bootstrap logger 不进入任何 DB、飞书或远程 transport。

### 9.2 防递归

所有可选 sink 必须满足：

- sink 内部日志标记 `sinkInternal=true`。
- `sinkInternal` 日志禁止进入 DB 和告警 sink。
- DB 写入期间抑制该次 Prisma error 再次持久化到 ErrorLog。
- 告警发送产生的 `feishu.alert.*`、`logger.sink.*` 错误永不触发新告警。
- 每个 sink 有熔断和半开恢复机制。

### 9.3 有界队列

若启用 ErrorLog 或应用内告警：

- 队列必须有最大条数和最大内存。
- 定义批大小、刷新间隔、单次超时和最大重试次数。
- 队列满时优先保留 fatal/error，丢弃较旧或较低价值记录。
- 丢弃时向 stderr 输出限频摘要，并暴露 `logger_dropped_total`。
- `SIGTERM/SIGINT` 最多等待固定时间 flush，不能无限阻塞退出。

“best effort”只表示不阻塞主业务，不表示静默丢失。

---

## 10. 集中采集、保留与权限

### 10.1 PM2 本地缓冲

- stdout/stderr 由 PM2 落盘。
- 使用 PM2 或系统级轮转，按大小和时间共同限制。
- 建议本地保留 7–14 天，并设置总磁盘上限。
- Logtail 只采集 PM2 这一份日志路径。
- 磁盘使用率达到阈值必须告警。

### 10.2 SLS

- SLS Project/Logstore 必须与 ECS 位于中国大陆同地域或经公司合规确认的地域。
- 使用 TLS 传输、最小权限 RAM 角色和独立 Logstore。
- 默认保留 90 天；长期保留需单独评估费用和合规。
- ADMIN/运维按最小权限访问，普通 OPERATOR 不直接访问全量运行日志。
- 建立日志量、索引流量、存储费用预算和月度检查。
- 进入 SLS 前已完成应用侧脱敏，不能依赖 SLS 查询权限代替脱敏。

### 10.3 清理职责

| 数据 | 清理责任 |
|---|---|
| Task 执行日志 | 现有 `lib/log-cleanup.ts`，保留 90 天 |
| PM2 应用日志 | PM2/系统轮转，不由应用 cron 删除 |
| SLS 日志 | Logstore 生命周期策略 |
| 可选 ErrorLog | 数据库清理任务，默认 90 天 |
| 创作者对话 | 现有 retention 任务 |

当前部署为 PM2 单实例，可以继续使用进程内 cron。未来扩为多实例前，清理和调度任务必须增加数据库锁或迁移到独立 worker。

---

## 11. 告警

### 11.1 默认选择

生产优先使用 SLS 基于聚合查询告警，避免应用在自身故障时还承担告警可靠性。

建议首批告警：

- 任意 fatal。
- 5 分钟内同 fingerprint error 超过阈值。
- HTTP 5xx 比例持续超过阈值。
- Agent 结果处理连续失败。
- worker 连续多个周期失败或停止产生心跳。
- Logtail 停止采集。
- PM2 日志磁盘使用率过高。
- `logger_dropped_total` 增长。

### 11.2 应用内告警（可选）

如果 SLS 告警不能满足需求，应用内飞书告警必须：

- 使用独立告警 webhook，不能依赖发生故障的普通发送编排。
- 不从数据库临时读取告警凭证；可使用仅供告警的环境变量或启动时缓存。
- 同 fingerprint 在窗口内只发送一次，附计数和最近 requestId。
- 有发送超时、熔断和最大队列。
- 告警发送失败只写 bootstrap stderr，绝不递归告警。
- 消息中不带 stack、用户标识和敏感上下文，只提供 SLS 查询条件。

fingerprint 建议由以下字段组成：

```text
service + module + event + err.name + err.code + topStackFrame + release
```

不能只使用 `module+event+errName`，否则不同代码位置的错误会被错误合并。

---

## 12. 可选 ErrorLog 表与管理端

只有在明确需要“管理员不进入 SLS 也能查询高价值错误”时才启用。

```prisma
model ErrorLog {
  id            String   @id @default(cuid())
  occurredAt    DateTime
  ingestedAt    DateTime @default(now())
  level         String
  service       String
  environment   String
  release       String?
  module        String
  event         String
  msg           String
  requestId     String?
  traceId       String?
  taskId        String?
  runId         String?
  userIdHash    String?
  errName       String?
  errMessage    String?
  errStack      String?
  errCode       String?
  fingerprint   String
  fields        Json?

  @@index([occurredAt])
  @@index([module, level, occurredAt])
  @@index([requestId])
  @@index([traceId])
  @@index([taskId, occurredAt])
  @@index([fingerprint, occurredAt])
  @@map("error_log")
}
```

约束：

- 只保存显式高价值 error/fatal。
- `fields` 必须先经过白名单、脱敏、限深和限长。
- `userIdHash` 不保存原 userId。
- ErrorLog 写入必须走 §9 的隔离有界队列。
- ErrorLog 插入失败只降级到 stdout/stderr，不再尝试另一套应用文件。
- 保留期默认 90 天。

ADMIN 页面支持：

- 时间、module、level、requestId、traceId、taskId、fingerprint 筛选。
- 详情页默认折叠 stack。
- 禁止未脱敏原始日志下载。
- 查询接口用 `requireRole("ADMIN")`，并限制分页大小和时间范围。

---

## 13. 环境变量

```dotenv
# 核心输出
LOG_LEVEL=info
LOG_FORMAT=json
LOG_SERVICE=gameops-web
LOG_RELEASE=<git-sha>

# JSON 对象，避免 feishu.ws → FEISHU_WS 的模块名碰撞
LOG_LEVEL_OVERRIDES={"feishu.ws":"debug"}

# HTTP / DB 降噪
LOG_HTTP_SAMPLE_RATE=1
LOG_QUERY_SAMPLE_RATE=0
LOG_SLOW_QUERY_MS=500

# HMAC 去身份化；缺失时省略 userIdHash/chatIdHash
LOG_HASH_SECRET=

# 可选能力，默认关闭
LOG_ERROR_DB_ENABLED=false
LOG_ALERT_MODE=sls
```

规则：

- 环境变量继续由 `lib/validation/env.ts` 用 Zod 校验。
- 有安全含义的配置不能“格式错误后悄悄继续”；格式非法应在启动时失败。
- 可选功能未配置时关闭该功能并输出一次 bootstrap warn。
- `LOG_HASH_SECRET` 缺失时省略标识符，不能输出明文。
- Logtail、SLS Project、Logstore 和本地轮转属于部署配置，不伪装成应用内 `LOG_SLS_ENABLED` transport。

---

## 14. 前端错误上报（后续可选）

第一阶段不建设 `/api/client-log`。启用前必须同时具备：

- Zod 白名单 schema。
- 单请求大小限制。
- 用户/IP/会话维度限流。
- Origin/CSRF 校验。
- 消息、URL、stack 脱敏和限长。
- `release`、浏览器类别、route、错误 fingerprint。
- source map 在受控服务端解析，不能把源码或 source map 暴露给普通用户。
- 防止客户端伪造 fatal、persist、userId 和内部 module。

前端日志属于不可信输入，不能直接转发到 logger 或 ErrorLog。

---

## 15. 目录结构（计划）

```text
lib/logger/
  index.ts          # createLogger 与统一 API
  schema.ts         # LogRecord 类型、字段限制、事件约定
  context.ts        # AsyncLocalStorage
  redact.ts         # 白名单、递归脱敏、HMAC
  normalize.ts      # Error 和字段规范化
  bootstrap.ts      # 只写 stderr，永不进入派生 sink
  http.ts           # route() 请求完成与流式日志
  edge.ts           # Edge-safe JSON logger
  sinks/
    error-db.ts     # 可选，有界队列与防递归
    alert.ts        # 可选，独立告警通道与熔断

app/operator/admin/logs/       # 可选 ErrorLog ADMIN 页面
app/api/operator/admin/logs/   # 可选查询 API
```

PM2 轮转、Logtail 和 SLS 配置放在部署层，不放进 `lib/logger/transports/file.ts`。

---

## 16. 分阶段落地

### 阶段 0：容量与安全基线

- 统计当前 HTTP、Agent 轮询、worker 和 Prisma 日志量。
- 确认 SLS 地域、保留期、RAM 权限和费用预算。
- 冻结 schema、event 命名和敏感字段清单。
- 准备脱敏测试样本。

### 阶段 1：核心 logger

- pino stdout、schema、Error 规范化、白名单和递归脱敏。
- bootstrap logger。
- ALS requestId/traceId。
- Edge-safe logger。
- 只迁移应用代码 console；CLI 脚本保留终端输出。

### 阶段 2：关键接入

- `route()` 请求完成日志。
- 流式 AI 的完成/失败日志。
- cron、Agent、downloader、indexer、飞书 worker。
- 外部 HTTP 调用安全 serializer。
- Prisma error 和慢查询；普通 query 默认关闭。

### 阶段 3：生产采集与告警

- PM2 轮转。
- Logtail → 同地域 SLS。
- SLS 索引、看板、告警。
- 验证断网补传、日志轮转、磁盘上限和费用。

### 阶段 4：可选管理端错误页

- 确认 ADMIN 确实需要站内查询后，再增加 ErrorLog migration、隔离队列和页面。
- 完成 DB 不可用、队列满和递归保护测试后才能上线。

### 阶段 5：可选增强

- 前端错误上报。
- Prometheus/OpenTelemetry。
- 动态模块调级。
- 更完整的跨服务 trace。

---

## 17. 验收标准

### 17.1 功能

- 任一 API 响应返回 `x-request-id`，可在 SLS 查到对应完成日志。
- 一次 CrawlerTask 可通过 taskId 查到触发、领取、日志上传和结果回传。
- 一次舆情任务可通过 opinionTaskId 查到触发、轮询和下载。
- 流式 AI 失败记录真实 stream 状态，而不是仅记录 handler 已返回。

### 17.2 安全

自动化测试证明以下内容不会出现在最终 JSON、PM2 文件和 SLS：

- Authorization/Bearer/JWT
- Cookie/session
- Agent token
- `X-LLM-ApiKey`
- 飞书 webhook/AppSecret/Verification Token/EncryptKey
- 手机号、邮箱
- AI 消息正文
- 请求体、FormData、Excel/CSV 数组

### 17.3 故障

- PostgreSQL 不可用时不会发生 ErrorLog 递归。
- 飞书不可用时不会发生告警风暴。
- SLS/Logtail 不可用时业务请求不受影响，本地缓冲受磁盘上限保护。
- 队列满会产生限频 drop 摘要和指标，不会无限占用内存。
- SIGTERM/fatal 能在限定时间内 flush 并退出。

### 17.4 性能与成本

- logger 接入后的 API 延迟和吞吐回归在约定阈值内。
- Agent 高频空轮询和 5 秒取消探测不会造成不可接受的日志量。
- Prisma 普通 query 默认关闭时没有明显额外开销。
- SLS 日志量和月度费用不超过预算。

---

## 18. 实施前待确认

**已由项目负责人确认(2026-07-28),全部按推荐默认。** 据此:阶段4(ErrorLog 表 + 管理页)与前端错误上报暂不做;`no-console` 护栏与阶段3 部署接入按 §16 推进。第 6/7 项为对现状的追认(阶段1/2 已实现)。

- [x] SLS 与 ECS 使用同地域，默认保留 90 天。
- [x] PM2 本地日志保留 7–14 天，并设置磁盘总量上限。
- [x] 第一阶段不启用 ErrorLog 表和管理端运行日志页。
- [x] 第一阶段不启用前端错误上报。
- [x] 告警优先走 SLS；应用内飞书告警仅作备选。
- [x] 普通 Prisma query 在生产默认关闭，慢查询阈值暂定 500 ms。
- [x] userId/chatId 仅以 HMAC 形式记录，未配置密钥时完全省略。
- [x] ESLint `no-console` 只约束应用代码，允许 logger bootstrap、Edge logger 和 CLI 脚本。

这些事项确认后，再按 §16 分阶段实施；任何可选功能都不能绕过 §6 的脱敏和 §9 的隔离要求。
