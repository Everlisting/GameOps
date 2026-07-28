# 日志系统 · 阶段3 部署接入指南(PM2 → Logtail → SLS + 告警)

> 配套设计:`docs/logging.md`(§10 采集/保留、§11 告警、§13 环境变量)。
> 前提:阶段1(core)+ 阶段2(接入)已上线,应用已按统一 schema 向 **stdout 输出单行 JSON**。
> §18 已确认:SLS 与 ECS 同地域、保留 90 天;PM2 本地保留 7–14 天 + 磁盘上限;告警优先 SLS,应用内飞书告警仅备选。
>
> 本文是运维 runbook,实际上云在部署侧执行;代码侧无需再改。

---

## 0. 采集链路

```text
Node 应用(pino, stdout JSON)
   └─ PM2 落盘 + pm2-logrotate 轮转(本地缓冲,7–14 天)
        └─ Logtail(loongcollector/logtail-ds)采集这一份文件
             └─ 同地域 SLS Logstore(JSON 模式,索引/看板/告警)
```

单一采集源:Logtail 只采 PM2 的日志文件,应用不再另写 `storage/logs/app-*.log`,避免重复采集。

---

## 1. 生产环境变量

在生产 `.env` / PM2 env 里确认(缺省值见 `docs/logging.md §13`):

```dotenv
NODE_ENV=production
LOG_LEVEL=info
LOG_SERVICE=gameops-web
LOG_RELEASE=<部署的 git sha>       # 便于按版本定位错误来源
LOG_HASH_SECRET=<32+ 随机串>        # 未配置则 userIdHash/chatIdHash 全省略(不脱敏兜底)
LOG_SLOW_QUERY_MS=500              # 慢查询阈值
LOG_QUERY_SAMPLE_RATE=0           # 普通 query 默认不落
LOG_HTTP_SAMPLE_RATE=1            # 高频接口如需降噪再调低(<1)
# LOG_LEVEL_OVERRIDES={"feishu.ws":"debug"}  # 按 module 临时调级(JSON)
```

> `LOG_HASH_SECRET` 变更会改变聚合值,轮换需记录时间点。安全含义配置格式非法应在启动 `lib/validation/env.ts` 处失败。

---

## 2. PM2:落盘 + 轮转 + 磁盘上限

`ecosystem.config.js`(单实例;时间戳交给应用的 `ts`,PM2 不再前缀时间以免破坏 JSON):

```js
module.exports = {
  apps: [{
    name: "gameops-web",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    instances: 1,               // 并发=1;多实例前需给 cron/清理加锁(见 logging.md §10.3)
    exec_mode: "fork",
    env: { NODE_ENV: "production" },
    time: false,                // 关键:不要给 stdout 加时间前缀,保持整行合法 JSON
    out_file: "/var/log/gameops/web.out.log",
    error_file: "/var/log/gameops/web.err.log",
    merge_logs: true,
  }],
};
```

轮转用 `pm2-logrotate`:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M          # 单文件上限
pm2 set pm2-logrotate:retain 14              # 保留 14 份(约 7–14 天,视量而定)
pm2 set pm2-logrotate:compress true          # 旧文件 gzip
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

磁盘保护:`/var/log/gameops` 单独分区或配额;磁盘水位告警见 §5。

---

## 3. Logtail → SLS

1. **Project/Logstore**:在**与 ECS 同地域**建 Project(如 `gameops-prod`)、Logstore(如 `app-runtime`),保留期 **90 天**,独立 Logstore、最小权限 RAM 角色,TLS 传输。
2. **机器组**:ECS 装 Logtail(loongcollector),加入机器组。
3. **采集配置(极简模式 / JSON)**:
   - 采集路径:`/var/log/gameops/web.out.log`(+ `web.err.log`)。
   - 模式:**JSON**,每行一条;时间字段用 `ts`(UTC ISO8601),时间格式 `%Y-%m-%dT%H:%M:%S`。
   - 顶层键自动展开为字段(schemaVersion/level/service/module/event/msg/requestId/...)。
4. **索引字段**(建索引才能检索/告警,类型对齐):

   | 字段 | 类型 | 用途 |
   |---|---|---|
   | `level` | text | 级别筛选 |
   | `service` `environment` `release` `instanceId` | text | 来源/版本/进程 |
   | `module` `event` | text | 定位子系统与事件 |
   | `requestId` `traceId` | text | 单请求 / 单流程串联 |
   | `taskId` `jobId` `agentId` `opinionTaskId` `runId` `conversationId` `documentId` `worker` | text | 业务长流程串联 |
   | `route` `method` | text | HTTP 维度 |
   | `status` `durationMs` | long | HTTP/耗时聚合 |
   | `operation` `model` `queryFingerprint` | text | DB/模型维度 |
   | `peer` | text | 外部被调方(analysis/feishu) |
   | `userIdHash` `chatIdHash` | text | 去身份化聚合 |
   | `err.name` `err.code` | text | 错误聚合(JSON 嵌套字段) |

   > 明文脱敏在**应用侧已完成**(logging.md §6),不能靠 SLS 权限代替脱敏。

---

## 4. 常用 SLS 查询(看板起点)

```text
# 单次请求全链路
requestId: "<id>"

# 一次爬虫任务全过程(触发/领取/日志/回传)
taskId: "<id>"

# 一次舆情任务
opinionTaskId: "<id>"

# 未预期 5xx(按路由聚合)
event: http.request.completed and status >= 500 | select route, count(*) group by route order by count(*) desc

# 慢查询 Top(按指纹)
event: db.query.slow | select queryFingerprint, model, avg(durationMs), count(*) group by queryFingerprint, model order by count(*) desc

# 外部调用失败(按被调方)
event: external.call.failed | select peer, operation, count(*) group by peer, operation

# 流式 AI 失败
event: assistant.stream.failed | select model, count(*) group by model

# worker 心跳(每个 worker 最近一次 tick)
event: worker.tick.done or event: worker.started | select worker, max(__time__) group by worker
```

---

## 5. 告警(SLS 优先)

在 SLS 告警里建以下规则(应用故障时不依赖应用自身发告警;详见 logging.md §11):

| 规则 | 条件(建议) |
|---|---|
| 任意 fatal | `level: fatal` count ≥ 1 / 5min |
| 同 fingerprint 错误激增 | 按 `service+module+event+err.name+err.code+release` 分组,单组 error ≥ N / 5min |
| 5xx 比例 | `status>=500` 占 `http.request.completed` 比例 > 阈值,持续 X min |
| Agent 结果连续失败 | `event: agent.task.result_failed` 连续 ≥ N |
| worker 停心跳 | 某 `worker` 超过 M 分钟无 `worker.tick.done` |
| Logtail 停采 | SLS 内置「采集停止」告警 |
| 磁盘水位 | ECS 监控 `/var/log/gameops` 使用率 > 80% |
| 丢弃指标 | (启用有界队列后)`logger_dropped_total` 增长 |

告警消息只带 **SLS 查询条件 + 计数**,不带 stack / 用户标识(logging.md §11.2)。

> 应用内飞书告警仅作备选,且必须独立告警 webhook + 熔断 + 防递归(logging.md §11.2);当前**不启用**。

---

## 6. 保留与清理职责

| 数据 | 责任方 | 保留 |
|---|---|---|
| 应用运行日志(PM2 文件) | pm2-logrotate | 7–14 天 |
| 运行日志(SLS) | Logstore 生命周期 | 90 天 |
| 任务执行日志 `data/logs` | 现有 `lib/log-cleanup.ts` cron | 90 天 |
| 创作者对话 | 现有 `lib/assistant/retention.ts` cron | 1 月 |

---

## 7. 上线核对清单

- [ ] 生产 env 就位(§1),`LOG_HASH_SECRET` 已设。
- [ ] PM2 `time:false`,`out_file` 为整行 JSON(`head` 看一行能 `JSON.parse`)。
- [ ] pm2-logrotate 生效(`pm2 conf pm2-logrotate`),磁盘配额就位。
- [ ] SLS Project/Logstore 同地域、保留 90 天、独立 RAM 角色。
- [ ] Logtail JSON 采集正常,索引字段建齐(§3)。
- [ ] 抽查:用 `curl -i` 命中任一接口,响应头有 `x-request-id`,SLS 能按该 id 查到 `http.request.completed`。
- [ ] 抽查:SLS 全文搜任一敏感串(如某测试手机号)命中 0 条(脱敏生效)。
- [ ] §5 告警规则建好并测试触发一次。

---

## 8. 暂不做(§18 确认)

- 阶段4:ErrorLog 表 + ADMIN 站内查询页(需要时再按 logging.md §12 启用,含隔离有界队列)。
- 阶段5:前端错误上报(logging.md §14)、OpenTelemetry。
