# 爬虫 Agent ↔ 中台 协议(阶段 4,Jenkins-style 重构后)

> 单向出站:爬虫机轮询中台领任务、回传日志与产物。中台**不**主动连爬虫机。
>
> 设计要点:
> - **Job/Task 分离**:Job 是模板(仓库 / 命令模板 / 参数 schema / 产物 / 超时 / cron),Task 是一次执行(Jenkins 的 Job/Build)。
> - **Agent 绑定**:Job 显式绑定 1 台 Agent;Task 由该 Agent 独占领取,**并发=1**(同 Agent 同时只跑 1 条)。
> - **抢占式已删除**:`kind` / `capabilities` / `csvType` 派单逻辑全部下线;Agent 只看自己 `agentId` 队列。
> - **失败一律失败**:`git pull 失败` / `命令非零退出` / `声明的产物缺失` 三种都终态化为 FAILED,不自动重试,需要管理员/运营手动重跑(克隆新 Task)。
> - **enabled 仅控 cron**:Job.enabled=false 时 cron 不再自动触发,**手动触发(MANUAL/rerun)依然允许**。
> - **关键动作走审计**:trigger / cancel / requeue / rerun / priority 都写一条 `AuditLog`(actor + 时间 + details JSON)。

---

## 1. 鉴权

所有 `/api/agent/*` 请求需在头部带:

```
Authorization: Bearer <agentId>.<secret>
```

`<agentId>.<secret>` 由管理员在中台「新建机器」时一次性发回。服务端只存 `<secret>` 段的 argon2 哈希,无法回放;丢了走 `/operator/admin/agents/[id]/rotate-token` 重置。

爬虫机端推荐 env:

```ini
CRAWLER_BASE_URL=https://gameops.example.com
CRAWLER_TOKEN=<agentId>.<secret>
```

无需再配 `CRAWLER_CSV_TYPES` —— 派单与 csvType 无关,csvType 写在 Job.outputs[] 上。

---

## 2. Agent 主循环(伪代码)

```
loop:
    next_ms = heartbeat()          # 上报心跳,拿建议轮询间隔
    task = claim()                 # 领一条本机的 PENDING
    if task is None:
        sleep(next_ms); continue

    log = open_log_stream(task.id) # 后续 stdout/stderr 通过 /log 推
    try:
        sync_repo(task.job)        # git clone/pull 或 svn checkout
        cmd = render(task.job.command, task.paramValues)
        rc  = run(cmd, cwd=workdir, timeout=task.job.timeoutMinutes*60, tee=log)
        if rc != 0:                          raise Failure(f"exit={rc}")
        files = collect_outputs(task.job.outputs, workdir)  # 缺产物=失败
        upload_result(task.id, success, files)
    except Failure as ex:
        upload_result(task.id, failure, errorMessage=str(ex))
```

中台对 Agent 的全部约束就是上面这五步;每一步对应一个 HTTP 端点。

---

## 3. 接口

### 3.1 `POST /api/agent/heartbeat`

**Body**(可选):

```json
{ "agentStatus": "idle", "version": "0.2.0" }
```

**Resp**:

```json
{
  "now": "2026-06-01T12:00:00.000Z",
  "pending": 2,
  "suggestPollMs": 5000
}
```

`pending` 仅统计**本 Agent 队列**里的 PENDING 数。`suggestPollMs` 有活 5s、无活 30s。

### 3.2 `POST /api/agent/tasks/claim`

**Body**:`{}`(留空,不再传 csvTypes)

**Resp(无活)**:

```json
{ "task": null }
```

**Resp(派一条)**:

```json
{
  "task": {
    "id": "ckxxxx",
    "sequenceNumber": 42,
    "priority": 0,
    "createdAt": "2026-06-01T11:50:00.000Z",
    "paramValues": { "startDate": "2026-05-01", "endDate": "2026-05-04" },
    "job": {
      "id": "cjyyyy",
      "name": "douyin-video-detail",
      "repoType": "GIT",
      "repoUrl": "git@github.com:foo/scrapers.git",
      "repoBranch": "main",
      "workdir": ".",
      "command": "python douyin/video_detail.py --start {{startDate}} --end {{endDate}}",
      "timeoutMinutes": 30,
      "outputs": [
        { "path": "out/video_detail.csv", "csvType": "douyin_video_detail" },
        { "path": "data/*-总表.csv", "csvType": "douyin_overview" },
        { "path": "data/直播场次.csv", "optional": true },
        { "path": "out/report.html" }
      ]
    }
  }
}
```

**并发安全**:服务端单语句 `UPDATE … SELECT FOR UPDATE SKIP LOCKED`,且嵌入 `NOT EXISTS (RUNNING for self)`,**同 Agent 已有 RUNNING 时直接返回 null**(并发=1 由服务端保证)。Agent 端无需自己做 lock。

**Agent 端必做**:
1. 按 `job.repoType` `git clone/pull` 或 `svn checkout/update` 到本地工作区,**保留原仓库目录名**(`workspaces/job-<id>/<repoName>/`),checkout 到 `repoBranch`(为空 = 默认分支)。**拉代码失败即终态失败**。
2. 用 `job.paramValues` 渲染 `job.command` 里的 `{{var}}`(渲染规则见 §4);**同时**把所有 paramValues 作为 env 变量注入子进程(脚本可 `os.environ["开始时间"]` 读取)。
3. 在 `job.workdir`(相对仓库根的路径)下执行命令,捕获 stdout+stderr,**实时**通过 §3.3 推回中台。
4. 等命令退出或 `job.timeoutMinutes` 触发超时(超时 = 杀进程 + 终态失败)。
5. 检查 `job.outputs[*].path` 是否都存在(支持 glob `*` `?` `[]`),`optional: true` 的项无匹配静默跳过,否则缺一即失败。
6. **上传所有匹配到的产物**(无论有无 csvType)。`csvType` 非空 → 走 parser/snapshot 入解析层;`csvType` 空 → 留底入 `_uncategorized/`,数据集页可下载。

### 3.3 `POST /api/agent/tasks/{id}/log`

实时推子进程输出。append-only。同时**作为取消检测通道**。

- `Content-Type`: `text/plain; charset=utf-8`(允许空 body)
- Body 即一段 stdout/stderr 文本(可包含换行;agent 应做 UTF-8 / GBK 解码 + ANSI 剥除)
- 单次 body 上限 **1 MB**,超过会被服务端截断
- 服务端写到 `data/logs/<taskId>.log`(首次写时把 `logPath` 持久化到 task)
- 运营 / 管理员都能在 `/operator/tasks/<jobId>/runs/<runId>` 折叠日志区实时尾随
- 任务转 CANCELED / PENDING 时,**服务端会自动追加一行 `[server] ...` marker** 到日志末尾(便于看收尾原因)

**Resp**:

```json
{ "ok": true, "bytes": 4096 }
```

**调用约束**:任务必须由当前 Agent **RUNNING**;否则 4xx。
**Agent 应将 4xx(404/409)视为"任务已被取消/结束"信号** —— 立即 kill 子进程,放弃这条 task,继续 claim 下一条。Agent 主动空 POST `/log`(每 5s)即可在子进程沉默时也感知取消。

### 读取日志(管理员 / 运营 UI 用,Agent 不需要)

`GET /api/admin/tasks/{id}/log`(鉴权 OPERATOR)

Query(四选一):
- `offset=N`:从字节 N 开始读(增量 tail)
- `tail=N`:返回末尾 N 字节
- `lines=N`:返回末尾 N 行(UI 折叠默认 100 行)
- `download=1`:`Content-Disposition: attachment`,触发下载

响应 header:
- `X-Log-Size`:文件总字节数
- `X-Log-Status`:当前 task 状态(决定 UI 是否继续轮询)

### 3.4 `POST /api/agent/tasks/{id}/result`

终态上报。一次调用,Task 进入 SUCCEEDED 或 FAILED,**不可重试**。

`Content-Type: multipart/form-data`:

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `status` | ✅ | `success` / `failure` |
| `exitCode` | 可选 | 子进程退出码(stringified int) |
| `errorMessage` | failure 必填 | 错误说明,≤ 2000 字符;success 时也允许传(作为 warning) |
| `csvTypes` | success 时填 | JSON 数组,**每项是 string 或 null**,与对应 `files` 项 1:1 |
| `files` | success 时填 | multipart 文件字段,可重复;按 `csvTypes` 数组顺序与之 1:1 配对 |

**注意**:
- `csvTypes` 与 `files` **必须一一对应**(数量相等),否则 400。
- `csvTypes` 项允许为 `null` 或省略字符串:服务端按"未分类"处理 —— **仍然落盘 + 建 RawDataset**,但**不跑** parser/snapshot,放 `data/raw/_uncategorized/<datasetId>.csv`,数据集页可下载。
- success 但 `files` 为 0 个**也合法**(脚本只发飞书等)。
- 单文件 ≤ 200 MB。

**Resp(success)**:

```json
{
  "ok": true,
  "status": "SUCCEEDED",
  "datasets": [
    {
      "csvType": "douyin_video_detail",
      "datasetId": "uuid-xxx",
      "parsed": true,
      "rowCount": 842,
      "parseError": null,
      "snapshotCount": 842
    }
  ]
}
```

**Resp(failure)**:

```json
{ "ok": true, "status": "FAILED" }
```

服务端处理:
- success:每份文件落盘到 `data/raw/<csvType>/<datasetId>.csv`,建 `RawDataset`,跑 parser/snapshotter(parser 失败仅记 `parseError`,不影响 Task 终态)。Task → `SUCCEEDED`。
- failure:不入库,Task → `FAILED`,管理员可在 UI 看到 `errorMessage` / `exitCode`。

**调用约束**:任务必须由当前 Agent RUNNING;否则 409。

---

## 4. 命令模板渲染规则

`job.command` 里的 `{{name}}` 占位用 `task.paramValues` 替换:

- `name` 允许 Unicode 字母 / 数字 / 下划线,首字符不能是数字。**中文参数名合法**(如 `{{开始时间}}`)。
- 缺值或 null → 替换为空串。
- 其余值用 `String(value)` 序列化。
- **Agent 不要 shell 转义**;推荐 Agent 端用 `shlex.split` 先拆 token,再逐 token 替换 `{{var}}`,避免 shell 注入。

参考实现见 `lib/jobs.ts` 的 `renderCommand`(供单测对齐)。

**同时**,agent **必须**把所有 paramValues 作为 env 变量注入子进程。这样脚本既可以通过命令行 `--start=...` 拿到(走模板渲染),也可以通过 `os.environ["开始时间"]` 拿到,两种方式都支持,选一种用即可。

---

## 5. 参数 schema(给 Agent 端理解 `paramValues`)

`paramValues` 是中台校验过的 JSON 对象。每个参数在 Job.paramSchema 里声明类型:

| type | JSON 形态 | env 注入形态 | 例 |
| --- | --- | --- | --- |
| `DATE` | ISO 字符串 `"YYYY-MM-DD"` | 同 | `"2026-05-01"` |
| `STRING` | 字符串 | 同 | `"6团"` |
| `NUMBER` | 数字 | `str(value)` | `42` 或 `3.14` |
| `ENUM` | 字符串,值在 options 内 | 同 | `"PRODUCTION"` |
| `EXCEL` | **行数组** `[{col1: v1, col2: v2}, ...]`(运营端上传 .xlsx/.csv 解析得) | **JSON 字符串**(`json.dumps`) | `[{"UID":"123","备注":"A"}, ...]` |

EXCEL 类型由 `paramSchema[*].columns: string[]` 指定必须包含的表头列。运营端在 UI 上传文件,前端校验表头并转为行数组,以 JSON 形式存进 paramValues。

Agent 端注入 env 时:list / dict 类型用 `json.dumps(v, ensure_ascii=False)`,字符串类型直接传。
脚本里读 EXCEL 类型:

```python
import json, os
rows = json.loads(os.environ["指定uid"])
for r in rows:
    uid = r["UID"]
```

---

## 6. 失败 = 失败,不再自动重试

`maxAttempts` / `attemptCount` 字段已删。任何下列情况都让 Task 终态为 FAILED:

| 触发 | 触发方 | errorMessage 示例 |
| --- | --- | --- |
| `git pull` / `svn checkout` 非零 | Agent | `"git clone failed: exit=128"` |
| 命令子进程非零退出 | Agent | `"command exit=2"` |
| 命令超时 | Agent | `"command timeout after 30min"` |
| 声明的产物缺失 | Agent | `"missing output: out/video_detail.csv"` |
| 中台收到 `status=failure` | 中台 | (透传 Agent 的) |

**重试**:管理员可在 task 详情页点「重跑」(走 `/api/operator/tasks/[id]/rerun`),会用同样的 `paramValues` 克隆一条新 Task,原 Task 历史保留。

---

## 7. 管理员侧 API(给中台 UI 用)

| 方法 | URL | 说明 |
| --- | --- | --- |
| `GET / POST` | `/api/admin/agents` | 列 / 建 Agent(POST 返回 token,仅一次) |
| `PATCH / DELETE` | `/api/admin/agents/{id}` | 改 name/status;有绑定 Job 时拒删 |
| `POST` | `/api/admin/agents/{id}/rotate-token` | 重置 token |
| `GET / POST` | `/api/admin/jobs` | 列 / 建 Job 模板 |
| `GET / PATCH / DELETE` | `/api/admin/jobs/{id}` | 详情 / 改 / 删(有未完成 Task 时拒删) |
| `POST` | `/api/admin/jobs/{id}/trigger` | 手动触发一次执行(降权到 OPERATOR + 写 audit) |
| `GET` | `/api/admin/cron-preview?expr=...` | 预览 cron 表达式下一次执行时间 |
| `GET` | `/api/admin/tasks` / `/api/admin/tasks/{id}` | 列 / 详情 |
| `PATCH` | `/api/admin/tasks/{id}` | 取消 / 重排队 / 调优先级(OPERATOR + 写 audit) |
| `GET` | `/api/admin/tasks/{id}/log` | 读日志(`?offset` / `?tail` / `?lines` / `?download=1`,OPERATOR) |
| `POST` | `/api/operator/tasks/{id}/rerun` | 重跑(运营+管理员;写 audit) |

---

## 8. 产物清单(outputs)详解

每个 Job 产物声明三个字段:

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `path` | ✅ | 相对 workdir 的文件路径。支持 glob 元字符 `*` / `?` / `[]`(不递归,要递归用 `**/`)。 |
| `csvType` | 可选 | 入库类别。非空 → parser/snapshot;空 → 留底 `_uncategorized/` 不解析。 |
| `optional` | 可选,默认 false | true 时文件 / glob 无匹配静默跳过;false 时无匹配 → task FAILED。 |

Agent 行为:

```
for each output in job.outputs:
    if path 含 glob:
        matches = workdir.glob(path)  # 排序后
        if 0 个匹配:
            if optional: continue
            else: raise "missing output (glob 无匹配)"
        else:
            把所有 match 加入待上传列表
    else:
        if 文件存在: 加入列表
        elif optional: continue
        else: raise "missing output"

# 上传时:每份 file 配一个 csvType(允许 null)
```

---

## 9. 落盘 / 存储约定

- 原始 CSV(分类入库):`data/raw/<csvType>/<datasetId>.csv`
- 未分类留底:`data/raw/_uncategorized/<datasetId>.csv`
- 子进程日志:`data/logs/<taskId>.log`,**保留 90 天**(`instrumentation.ts` 注册的 cron 每天 03:00 Asia/Shanghai 清理)
- 上线 OSS 后,只换 `app/api/agent/tasks/[id]/result/route.ts` 末尾的 `fs.writeFile` 为 OSS putObject;`RawDataset.storagePath` 写 OSS key。其他链路无感。

---

## 10. Task 状态机

```
PENDING ──claim──▶ RUNNING ──result(success)──▶ SUCCEEDED
                       │
                       └──result(failure) ─────▶ FAILED ──rerun──▶ (新 Task) PENDING
                                                       └──requeue──▶ PENDING (同一 task)

任何状态(非终态) ──取消──▶ CANCELED ──rerun──▶ (新 Task) PENDING
                                       └──requeue──▶ PENDING (同一 task)
```

**没有自动重试边**,FAILED 不会自己跳回 PENDING。
**rerun vs requeue**:rerun 克隆新 task(留历史),requeue 把当前 task 重置回 PENDING(覆盖原历史)。运营 UI 都给。

---

## 11. 相关文件

| 路径 | 说明 |
| --- | --- |
| `prisma/schema.prisma` | `CrawlerJob` / `CrawlerTask` / `CrawlerAgent` / `RawDataset` 数据模型 |
| `lib/agent-auth.ts` | Bearer 鉴权 |
| `lib/agent-token.ts` | Token 生成 / 拼装 |
| `lib/jobs.ts` | `createTaskFromJob` + `renderCommand` |
| `lib/cron-scheduler.ts` | node-cron 注册表(syncJob/removeJob) |
| `lib/log-cleanup.ts` | 90 天日志清理 |
| `app/api/agent/heartbeat/route.ts` | 心跳 |
| `app/api/agent/tasks/claim/route.ts` | SKIP LOCKED + 并发=1 |
| `app/api/agent/tasks/[id]/log/route.ts` | 流式日志 append |
| `app/api/agent/tasks/[id]/result/route.ts` | 多文件多 csvType 终态上报 |
| `app/api/admin/jobs/*` | Job CRUD + trigger |
| `app/api/admin/cron-preview/route.ts` | cron 预览 |
| `docs/agent-setup-guide.md` | 给运维的接入操作手册 + Python 参考实现 |
