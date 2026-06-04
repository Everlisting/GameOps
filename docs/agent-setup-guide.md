# 爬虫机接入完整流程(Windows 端 → 中台,Jenkins-style 重构后)

> 配套 `docs/agent-protocol.md`(协议参考)。本文偏操作手册:从在中台「新建机器」拿到 token、建 Job 模板,到爬虫机真的能跑任务、产数据。
>
> 角色分工:
>
> - **管理员(ADMIN)**:在中台建机器、建 Job 模板、触发任务、看日志
> - **运维 / 自己**:在 Windows 机器上配 env、装 git / Python 依赖、起 agent 进程
> - **运营(OPERATOR)**:看任务进度、点「重跑」、下载产物 CSV

---

## 整体架构

```
┌──────────────────────┐                         ┌────────────────────────┐
│  Windows 爬虫机       │                         │  中台(阿里云)         │
│                      │                         │                        │
│  ┌────────────────┐  │  1. heartbeat           │  ┌───────────────────┐ │
│  │ Python agent   │──┼─────────────────────▶ │  │ /api/agent/*      │ │
│  │ daemon         │  │  2. claim (本机队列)    │  │   (Bearer 鉴权)    │ │
│  │                │ ◀┼─────────────────────  │  └───────────────────┘ │
│  │  ① 拉任务       │  │  3. git/svn 同步代码    │
│  │  ② 同步仓库     │──┼──────────────┐         │  ┌───────────────────┐ │
│  │  ③ 跑命令模板    │              │ git pull │  │ parser → 明细层    │ │
│  │  ④ 流式日志推送  │──┼─────────▶ │   仓库  │  │       → 每日快照    │ │
│  │  ⑤ 上传产物 csv  │──┼──────────────┘──────▶ │  └───────────────────┘ │
│  └────────────────┘  │                         │                        │
└──────────────────────┘                         └────────────────────────┘
       本地内网(单向出站)                            公网(HTTPS)
```

要点:

- **Jenkins 风格**:中台只下发 task(job 仓库地址 + 命令模板 + 参数值);Agent 自己拉代码、跑命令、上传产物。
- **拉模型**:爬虫机主动轮询中台,中台不主动连爬虫机。无需公网 IP / 端口映射。
- **绑机**:每个 Job 显式绑定 1 台 Agent;该 Agent **并发=1**,同时只跑 1 条 task,多的排队。
- **失败=失败**:`git pull` 失败 / 命令非零退出 / 产物缺失 / 超时,都终态 FAILED,需要手动重跑。

---

## 第 1 步 · 在中台创建爬虫机(管理员)

### 1.1 进入新建页

登录管理员账号(role=ADMIN)→ 左侧栏「管理面板 / 爬虫机」→ 右上「新建机器」按钮。 URL:`/operator/admin/agents/new`。

### 1.2 只填一个字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| 机器名 | 全局唯一,日志识别用,创建后还能改 | `local-win-01`、`shanghai-dorm-pc` |

> 重构后(2026-06)删了 capabilities/csvType 字段:这台机器能跑什么由后续给它**绑定 Job** 决定,Agent 端不再需要声明能力。

### 1.3 提交后弹出 Token

点「创建机器」→ 中台返回一个 token,**仅此一次显示**:

```
ckxxxxxxxxxxxx.AbCdEfGhIjKlMnOpQrStUvWxYzABC
└─────┬─────┘ └────────────┬────────────────┘
   agentId               secret
```

弹窗里有「复制 Token」按钮,**点完再关弹窗**。

> ⚠️ 关掉就回不来了 —— 服务端只存 secret 段的 argon2 哈希。丢了只能进编辑页点「重置 Token」(旧 token 立刻作废)。

---

## 第 2 步 · 在 Windows 爬虫机上配 env

### 2.1 必填两个变量(不再需要 csvType)

```ini
# 中台地址(生产强烈建议 https)
CRAWLER_BASE_URL=https://gameops.example.com

# 第 1 步拿到的完整 token,<agentId>.<secret> 形式
CRAWLER_TOKEN=ckxxxxxxxxxxxx.AbCdEfGhIjKlMnOpQrStUvWxYzABC
```

可选:

```ini
# Agent 工作根目录,所有 Job 的 repo 会克隆到这里下的子目录;默认 ./workspaces
CRAWLER_WORK_ROOT=D:\crawler\workspaces
```

### 2.2 注入方式(三选一)

**方式 A:`.env` 文件(推荐)**

爬虫脚本目录下放 `.env`(**记得 gitignore**),Python 端用 `python-dotenv`:

```python
from dotenv import load_dotenv
load_dotenv()
```

**方式 B:Windows 系统环境变量**

`Win + R` → `sysdm.cpl` → 高级 → 环境变量 → 新建用户变量。改完**要重启 cmd / PowerShell** 才生效。

**方式 C:启动命令行临时设置**

```powershell
$env:CRAWLER_BASE_URL = "https://gameops.example.com"
$env:CRAWLER_TOKEN    = "ckxxx.AbCdEfGhIj..."
python agent.py
```

### 2.3 验证 token(curl smoke test)

```bat
curl -X POST https://gameops.example.com/api/agent/heartbeat ^
  -H "Authorization: Bearer ckxxx.AbCdEfGhIj..." ^
  -H "Content-Type: application/json" ^
  -d "{}"
```

预期响应:

```json
{ "now": "2026-06-01T12:00:00.000Z", "pending": 0, "suggestPollMs": 30000 }
```

回中台 `/operator/admin/agents/<id>`,「最近心跳」会刷出当前时间 + 你的出口 IP;header 离线徽章也消失。

常见失败:
- `401 Token 无效` → token 漏了 `agentId.` 前缀
- `403 机器已被停用` → 编辑页把状态从「停用」改回「启用」
- 连不上 → 看防火墙、代理、域名 DNS

---

## 第 3 步 · 管理员创建 Job 模板

### 3.1 进入新建页

`/operator/admin/jobs/new`(左侧栏「管理面板 / 爬虫 Job」→ 「新建 Job」)。

### 3.2 字段速查

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| Job 名 | 全局唯一,UI 识别用 | `douyin-video-detail` |
| 绑定爬虫机 | 下拉选第 1 步建好的 Agent;**只在这台机器跑** | `local-win-01` |
| 仓库类型 / URL / 分支 | `git` 或 `svn`;Agent 会 clone/pull | `GIT` / `git@github.com:foo/scrapers.git` / `main` |
| 工作目录 | 相对仓库根的相对路径,命令在此目录下执行 | `.` 或 `crawlers/douyin` |
| 命令模板 | 含 `{{var}}` 占位;Agent 渲染后跑 | `python video_detail.py --start {{startDate}} --end {{endDate}}` |
| 单次超时 | 分钟数,默认 30,最大 720 | `30` |
| 参数 schema | 按需添加;字段 name/label/type/required/default/options | 见下表 |
| 产物清单 | 命令执行完后 Agent 按 path 捡;**有 csvType 才上传中台入库**,没有的留本机自处理 | 见下表 |
| Cron | 可选 5 段标准表达式(`m h dom mon dow`,只允许 `0-9 * , - /`) | `0 3 * * *` |
| 启用 | 关掉后无法被 trigger / cron | `true` |

**参数 schema 示例**:

| name | label | type | required | default | options |
| --- | --- | --- | --- | --- | --- |
| `startDate` | 起始日期 | DATE | ✅ |  |  |
| `endDate` | 结束日期 | DATE | ✅ |  |  |
| `env` | 环境 | ENUM |  | `prod` | `prod,staging` |

UI 会按 type 渲染表单(DATE → `DatePickerField`,ENUM → `Select`,等)。

**产物清单示例**:

| path | csvType | 行为 |
| --- | --- | --- |
| `out/video_detail.csv` | `douyin_video_detail` | Agent 上传 → 中台 parser → 明细层 + 当日快照 |
| `out/report.html` | (空) | 留在爬虫机,由脚本自己发飞书 / 邮件 |

**命令模板里所有 `{{var}}` 必须在参数 schema 里声明**(Zod 会拦)。

### 3.3 触发一次

详情页右上「立即触发」→ 按 paramSchema 填表 → 「触发」。

中台立刻创建一条 `PENDING` Task,挂到 Job 绑定的 Agent 队列。

如果配了 Cron,启用后会被 `lib/cron-scheduler` 自动加进调度表,到点也会创建一条 `trigger=AUTO` 的 Task。

---

## 第 4 步 · Python agent 主循环(参考实现)

中台只约定 HTTP 协议,Agent 怎么写都行。**项目自带一份可直接拷部署的参考实现**,放在仓库根的 `agent-reference/` 目录,功能完整、考虑了 Windows 任务计划程序部署 / heartbeat + executor 进程分离 / 取消监听 / git deploy key / 编码兜底等实战细节。

### 4.1 文件清单

`
agent-reference/
├─ common.py          # env / HTTP session / 日志公共模块
├─ heartbeat.py       # 一次性心跳;TS 每 1 分钟触发
├─ executor.py        # 常驻执行器(claim→sync→run→tee log→upload)
├─ heartbeat.bat      # TS 喂的入口
├─ executor.bat
├─ tasks/heartbeat.xml   # TS XML(改两个占位符就能 schtasks /create /xml 导入)
├─ tasks/executor.xml
├─ requirements.txt
├─ .env.example
├─ .gitignore
└─ README.md          # 部署详细步骤、故障排查、升级流程
`

### 4.2 部署 5 条命令

`powershell
# 把整个 agent-reference/ 拷到爬虫机,例如 D:\crawler\agent-reference\
cd D:\crawler\agent-reference
pip install -r requirements.txt
copy .env.example .env   # 编辑填 CRAWLER_BASE_URL + CRAWLER_TOKEN

# 改 tasks\*.xml 里两个占位符 __AGENT_DIR__ / __USER__,然后:
schtasks /create /xml ".\tasks\heartbeat.xml" /tn "GameOps Crawler Heartbeat"
schtasks /create /xml ".\tasks\executor.xml"  /tn "GameOps Crawler Executor"
schtasks /run /tn "GameOps Crawler Heartbeat"
schtasks /run /tn "GameOps Crawler Executor"
`

### 4.3 设计关键点(给会调代码的人看)

executor.py 内部分了几个独立部分,可单独替换:

| 模块 | 行为 | 失败处理 |
| --- | --- | --- |
| `claim` | POST `/api/agent/tasks/claim`,空 body | 网络瞬时错(DNS / 502 / timeout)只 WARN 一行,10s 后重试 |
| `sync_repo` | git clone/pull 或 svn co/up,clone 到 `<workspace>/<repoName>/`(保留原仓库目录名,兼容 `from <repoName> import ...` 这种依赖目录名的 Python 项目) | 注入 `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes"` 防 host key 校验卡死 |
| `render_command` | `shlex.split` 后逐 token 替换 `{{var}}`,Unicode 名(中文)合法 | 缺值 → 空串 |
| `run_command` | Popen 出子进程,启两个线程:`pump`(读 stdout/stderr → 解码 UTF-8/GBK → 剥 ANSI → 推 `/log`)、`watchdog`(每 5s 空 POST `/log` 探活) | 子进程注入 `PYTHONIOENCODING=utf-8` `PYTHONUTF8=1` `NO_COLOR=1` `TERM=dumb` + 所有 paramValues |
| 取消监听 | `/log` 返回 4xx → `cancel_event.set()`;主循环每秒 `proc.wait(timeout=1)` 检查 → `proc.kill()` → 抛 `TaskCanceledError` | 5s 内 kill 子进程,handle_task 静默放弃(不调 result,中台已是终态) |
| `collect_outputs` | 字面量 + glob 双模式;`optional: true` 时无匹配跳过 | workdir 越权检查,防 `..` 穿越 |
| `upload_success` | multipart 上传 `files` + `csvTypes` JSON 数组,**csvType 可为 None** | None → 服务端落 `_uncategorized/` 留底,不入解析层 |

### 4.4 心跳和执行分离的好处

- executor 跑 30 分钟长任务时,heartbeat 仍每分钟独立报"我活着" → 中台不会误判离线
- heartbeat 挂了,TS 下一分钟自动重来
- executor 挂了,TS 配 `RestartOnFailure 1m × 999` 自动重拉

### 4.5 关键 env 变量

`ini
CRAWLER_BASE_URL=https://gameops.example.com
CRAWLER_TOKEN=<agentId>.<secret>
# 可选:
CRAWLER_WORK_ROOT=D:\crawler\workspaces    # 默认 ./workspaces
CRAWLER_LOG_DIR=D:\crawler\logs            # 默认 ./logs
`

详细文档见 `agent-reference/README.md`。

---

---

## 第 5 步 · 触发一次完整任务

### 5.1 管理员手动触发

`/operator/admin/jobs/<id>` → 右上「立即触发」→ 按 paramSchema 填表 → 「触发」。

中台立刻创建 `PENDING` task,挂到 Job 绑定的 Agent 队列。

### 5.2 Agent 自动领取并跑

Agent 端日志:

```
[INFO] heartbeat ok pending=1 next=5000ms
[INFO] === task ckabc seq=#42 job=douyin-video-detail ===
[INFO] exec ['python', 'video_detail.py', '--start', '2026-05-01', '--end', '2026-05-04'] in workspaces/job-cj123 (timeout=1800s)
...(脚本输出)...
[INFO] result(success) uploaded: {'ok': True, 'status': 'SUCCEEDED', 'datasets': [...]}
```

中台同步:
- task 详情页状态变 `RUNNING` → `SUCCEEDED`,展示 `sequenceNumber #42` + 多个 RawDataset 卡
- 管理员可在 `/operator/admin/tasks/<id>/log` 实时尾随子进程输出
- 运营在 `/operator/tasks` 看到绿色 ✅;`/operator/datasets` 也能下载 CSV

### 5.3 失败 / 重跑

任意一步失败(`git pull` 非零 / 命令退出非零 / 产物缺失 / 超时)→ task 终态 `FAILED`,详情页显示 `errorMessage` + `exitCode`。

**没有自动重试**。运营/管理员点 task 详情页右上「重跑」(`/api/operator/tasks/[id]/rerun`)→ 用同 `paramValues` 克隆一条新 task,原历史保留。

### 5.4 Cron 自动触发

Job 配了 `cronExpression` 且 `enabled=true` 时,`instrumentation.ts` 启动时注册的 `lib/cron-scheduler` 会按表达式定时创建 `trigger=AUTO` 的 task(`createdById=null`)。

Job 改了 cron / 启用状态 / 删了,会自动 `syncJob` / `removeJob`,无需重启进程。

---

## 任务状态机速查

```
PENDING ──claim──▶ RUNNING ──result(success)──▶ SUCCEEDED
                       │
                       └──result(failure)──────▶ FAILED ──rerun──▶ 新 PENDING task
```

`FAILED` 不会自己跳回 PENDING。**无自动重试**。

---

## 故障排查

| 现象 | 大概率原因 | 处理 |
| --- | --- | --- |
| `401 Token 无效` | token 没带 `<agentId>.` 前缀 / 拼错 / agent 被删 | 重看 env,或编辑页「重置 Token」 |
| `403 机器已被停用` | 管理员把 status 改成 DISABLED | 编辑页改回 ACTIVE |
| header 持续显示「N 台机器离线」 | ACTIVE 但 10 分钟无心跳 | 看爬虫机 agent 进程是否在跑;curl smoke test |
| heartbeat 通,但 claim 永远拿不到 | Agent 没被任何 Job 绑定 / 该 Agent 一直有 RUNNING 任务卡住 | 进 `/operator/admin/jobs` 看 Job.agentId;或去 `/operator/tasks?status=RUNNING` 取消僵尸 task |
| Task 卡在 RUNNING 不动 | Agent 端崩溃没上报 | 管理员手动取消;后续可加 cron 兜底超时 |
| 上传返回 `parsed=false` | parser 校验列头或 URL 解析失败 | 看任务详情 / 数据集列表的 `parseError` 字段;或在 Job.outputs 里去掉 csvType 只留底 |
| `409 任务不属于当前 agent` | 同一 task 被两个 agent 抢了(理论不会)/ token 被换过 | 重新 claim 即可 |
| `409 任务当前状态不可上报...` | Agent 在 RUNNING 之外的状态上报(被管理员先 CANCEL 了) | Agent 直接丢弃,继续下一轮 claim |
| Agent 端 `sync_repo failed: git clone failed` | SSH key 没配 / HTTPS 凭证缺 | 在爬虫机用人手 git clone 测一遍,把凭证存到 git credential helper |
| Job 删不掉 | Job 还有 PENDING/RUNNING task | 先到 `/operator/tasks?jobId=...` 取消所有进行中的 task |

---

## 多台爬虫机怎么部署

1. 每台机器**独立**在中台创建 agent(每台一份 token,不要复用)。
2. 一个 Job 只绑 1 台 Agent。需要多机分担 → 建多个 Job,各自绑不同 Agent。
3. 同一 Agent 内**并发=1**:多个 Job 触发到同一台,会按 `priority DESC, createdAt ASC` 排队跑。
4. 跨 Agent 间天然并行,没有抢占冲突。

---

## 高级用法

### Excel 参数(运营端上传 .xlsx / .csv)

Job paramSchema 加一条 `type = 表格(Excel)` 的参数,指定必含表头列(如 `UID,备注`):

| 字段 | 填法 |
| --- | --- |
| 参数名 | `指定uid` |
| 类型 | 表格(Excel) |
| 表头列 | `UID,备注` |

运营触发时上传文件,中台前端用 xlsx 库解析为 `[{UID:"...",备注:"..."}, ...]` 数组,以 JSON 串注入 env。脚本读取:

```python
import json, os
rows = json.loads(os.environ["指定uid"])
for r in rows:
    uid = r["UID"]
```

行数上限 5000,文件 ≤ 5 MB。

### glob 通配产物(支持 `*` / `?` / `[]`)

Job.outputs 的 path 写成 `数据/*-总表.csv` 这类模式,agent 用 `Path.glob` 展开,所有匹配文件都上传。
注意 `*` **不递归**,要递归用 `数据/**/*-总表.csv`。
无匹配会导致 task FAILED,除非勾选「可选」。

### 可选产物(按参数条件产出)

每条产物有「可选」勾选框。勾上后:
- 字面量路径 → 文件不存在静默跳过
- glob 路径 → 无匹配静默跳过

适合那种"参数 A=true 时才产出 X 表"的产物。

### csvType 留空 = 仅留底,不解析

每条产物的 csvType 是可选的:
- **有 csvType** → 上传 + 落 `data/raw/<csvType>/` + 跑 parser/snapshot(若注册)
- **空 csvType** → **仍上传** + 落 `data/raw/_uncategorized/`,数据集页可下载,但不入解析层

适合"只想留底备查,不需要做 BI 分析"的中间产物。

### 取消任务的传导路径

中台 UI 点「停止」(`PATCH /api/admin/tasks/<id> status=CANCELED`)→ 服务端追加 `[server] ...` marker 到日志末 → agent 端 watchdog 下次空 POST `/log` 收到 409 → `cancel_event.set()` → 主循环 kill 子进程 → 静默放弃。

整个链路 ≤ 5 秒。

---

## 上线 OSS 后只改两处

- `app/api/agent/tasks/[id]/result/route.ts` 末尾 `fs.writeFile` → OSS `putObject`,`RawDataset.storagePath` 写 OSS key
- `app/api/operator/datasets/[id]/download/route.ts` 的 `fs.readFile` → 签名 URL 重定向

Agent / parser / UI 全部无需改动。

---

## 相关文件位置

| 路径 | 说明 |
| --- | --- |
| `docs/agent-protocol.md` | 接口契约速查 |
| `prisma/schema.prisma` | `CrawlerJob` / `CrawlerTask` / `CrawlerAgent` |
| `lib/agent-auth.ts` | Bearer 鉴权 |
| `lib/agent-token.ts` | Token 生成 / 拼装 |
| `lib/jobs.ts` | `createTaskFromJob` + `renderCommand` |
| `lib/validation/job.ts` | Job paramSchema / outputs / cron Zod |
| `lib/cron-scheduler.ts` | node-cron 注册表 |
| `lib/log-cleanup.ts` | 90 天日志清理 |
| `lib/agent-offline.ts` | 10 分钟无心跳判离线 |
| `instrumentation.ts` | 启动 cron 调度器 + 日志清理 |
| `app/api/agent/heartbeat/route.ts` | 心跳 |
| `app/api/agent/tasks/claim/route.ts` | SKIP LOCKED + 并发=1 claim |
| `app/api/agent/tasks/[id]/log/route.ts` | 流式日志 append |
| `app/api/agent/tasks/[id]/result/route.ts` | 多 csvType 多文件终态上报 |
| `app/api/admin/jobs/*` | Job CRUD + trigger |
| `app/api/admin/cron-preview/route.ts` | cron 预览 |
| `app/api/admin/tasks/[id]/log/route.ts` | 管理员看日志 |
| `app/operator/admin/jobs/*` | Job 列表 / 编辑 / 触发 UI |
| `app/operator/admin/tasks/[id]/log/page.tsx` | 实时日志尾随 UI |
| `data/raw/<csvType>/<datasetId>.csv` | 原始 CSV 落盘 |
| `data/logs/<taskId>.log` | 子进程日志(保留 90 天) |
