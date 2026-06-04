# 爬虫机 Agent 参考实现(Windows + 任务计划程序)

> 这是给爬虫机用的最小可跑骨架。把整个 `agent-reference/` 目录拷到爬虫机,按下面 4 步走完即可常驻 + 开机自启。
>
> 设计:
>
> - **`heartbeat.py`** — 一次性心跳上报,任务计划每 1 分钟触发一次。中台 10 分钟无心跳判离线,1 分钟间隔 = 10 倍安全余量。
> - **`executor.py`** — 任务执行器,常驻进程,开机时启动一次。`claim → sync_repo → 跑命令 → 流推日志 → 上传产物`。
> - **进程分离的好处**:executor 在跑长任务时不影响心跳,中台不会误判离线;心跳挂了下次重来,executor 挂了任务计划兜底重启。

---

## 1. 装环境

```powershell
# 1. 装 Python 3.10+(勾选 "Add Python to PATH")
# 2. 装 Git for Windows(executor 用 git clone/pull;不装 SVN 也可以,除非用 SVN 仓库)
# 3. 装依赖(可选用 venv)
cd D:\crawler\agent-reference
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

如果用了 venv,记得**取消 `heartbeat.bat` 和 `executor.bat` 里 `call .venv\Scripts\activate.bat` 那行的注释**。

## 2. 配 .env

```powershell
copy .env.example .env
notepad .env
```

填:

```ini
CRAWLER_BASE_URL=https://gameops.example.com
CRAWLER_TOKEN=ckxxx.AbCdEfGhIj...   # 中台「新建机器」时一次性给的 token
```

可选:`CRAWLER_WORK_ROOT`(默认 `./workspaces`,数据多时建议挪到 D 盘大盘)、`CRAWLER_LOG_DIR`(默认 `./logs`)。

## 3. smoke test(确认环境通)

```powershell
# 跑一次心跳,应该看到 ok pending=0
python heartbeat.py

# 起一下 executor,看到 "executor started base=..."。
# Ctrl+C 退出
python executor.py
```

如果心跳报 401 / 403,看 README 末尾的"故障排查"。

## 4. 注册到 Windows 任务计划程序

下面给两种姿势:**A. 直接 XML 导入(推荐,3 秒搞定)**,**B. GUI 手点(看得见每一步)**。

### A. XML 导入

把 `tasks/heartbeat.xml` 和 `tasks/executor.xml` 里的两个占位符替换成你的实际路径:

- `__AGENT_DIR__` → 例如 `D:\crawler\agent-reference`
- `__USER__` → 跑这个任务的 Windows 用户名(用 `whoami` 看)

然后管理员 PowerShell 跑:

```powershell
schtasks /create /xml "D:\crawler\agent-reference\tasks\heartbeat.xml" /tn "GameOps Crawler Heartbeat"
schtasks /create /xml "D:\crawler\agent-reference\tasks\executor.xml"  /tn "GameOps Crawler Executor"
```

立刻验证:

```powershell
schtasks /run /tn "GameOps Crawler Heartbeat"
schtasks /run /tn "GameOps Crawler Executor"
schtasks /query /tn "GameOps Crawler Heartbeat" /v /fo LIST
schtasks /query /tn "GameOps Crawler Executor"  /v /fo LIST
```

跑一会儿后看 `logs/heartbeat.log` / `logs/executor.log` 是否在涨,中台 `/operator/admin/agents/<id>` 的「最近心跳」是否在刷。

### B. GUI 手点

打开 **任务计划程序**(`taskschd.msc`)→ **创建任务...**。

#### B.1 心跳任务

**常规**

- 名称:`GameOps Crawler Heartbeat`
- 选项:`不管用户是否登录都要运行`
- 勾 `使用最高权限运行`(避免没权限读 D 盘)
- 配置:`Windows 10`

**触发器** → 新建

- 开始任务:`按计划`
- 一次性 → 起始时间设当天
- 高级设置 → 勾 `重复任务间隔` → `1 分钟`,持续时间 `无限期`
- 勾 `已启用`

**操作** → 新建

- 操作:`启动程序`
- 程序或脚本:`D:\crawler\agent-reference\heartbeat.bat`
- 起始于(可选,但**必须填**):`D:\crawler\agent-reference`

**条件**

- 取消 `只有在计算机使用交流电时才启动此任务`(笔记本电池模式也跑)

**设置**

- 勾 `允许按需运行任务`
- 勾 `如果过了计划开始时间,立即启动任务`
- 如果该任务失败,按以下时间重启: `1 分钟`,尝试 `3` 次
- `如果运行时间超过`: `5 分钟` 后强制停止(防御卡死)

确定 → 弹密码输入框 → 输入该用户的 Windows 密码。

#### B.2 执行器任务

**常规**

- 名称:`GameOps Crawler Executor`
- 同上(后台运行 + 最高权限)

**触发器** → 新建

- 开始任务:`启动时`(系统启动)
- 勾 `延迟任务时间` `1 分钟`(等网络起来)
- 勾 `已启用`

**操作** → 新建

- 程序或脚本:`D:\crawler\agent-reference\executor.bat`
- 起始于:`D:\crawler\agent-reference`

**条件 / 设置**

- 取消 `只有在计算机使用交流电时才启动此任务`
- 勾 `如果过了计划开始时间,立即启动任务`
- 如果该任务失败,按以下时间重启: `1 分钟`,尝试 `999` 次(executor 是常驻,异常退出就重拉)
- ⚠️ **不要勾** `如果运行时间超过 X 后停止任务`(executor 是常驻进程,会被误杀)

---

## 文件结构

```
agent-reference/
├─ common.py            # env / HTTP / 日志公共模块
├─ heartbeat.py         # 一次性心跳
├─ executor.py          # 常驻执行器
├─ heartbeat.bat        # 心跳启动包(任务计划喂这个)
├─ executor.bat         # 执行器启动包
├─ requirements.txt
├─ .env.example
├─ .env                 # 真实 token,不要提交
├─ tasks/
│  ├─ heartbeat.xml     # 任务计划 XML(占位符待替换)
│  └─ executor.xml
├─ workspaces/          # 每个 Job 的代码仓库克隆位置(运行时创建)
│  └─ job-<jobId>/
│     └─ <repoName>/    # 保留原仓库目录名,兼容 `from <repoName> import ...`
└─ logs/                # 本地两路日志(运行时创建)
   ├─ heartbeat.log
   └─ executor.log
```

---

## 故障排查

| 现象 | 大概率原因 | 处理 |
| --- | --- | --- |
| 心跳日志一直没涨 | 任务计划没跑 / .bat 路径写错 | 在任务计划程序里右键任务 → 运行,看「上次运行结果」 |
| `401 Token 无效` | `.env` 的 `CRAWLER_TOKEN` 漏了 `<agentId>.` 前缀 | 重看中台发的 token,完整粘进去 |
| `403 机器已被停用` | 管理员把状态改成 DISABLED | 中台编辑页改回 ACTIVE |
| executor 跑起来又立刻退 | python / git 不在 PATH | 在该用户下 `python --version` `git --version` 测一下 |
| Task 卡在 RUNNING | executor 进程崩了 | 看 `logs/executor.log` 最后几行;任务计划会自动重启 |
| 数据集没入库,task 是 SUCCEEDED 但 datasets=[] | Job.outputs 里没声明 csvType | 进 `/operator/admin/jobs/<id>` 给产物补 csvType |
| 心跳间隔不准(比 1 分钟久) | 任务计划"重复任务"在某些 Windows 版本表现飘 | 直接给 executor 那种"启动时 + 失败重启"模式,把心跳也改成常驻循环 |
| `logs/` 里没文件 | 任务计划没"以最高权限运行",写不进 | 任务属性 → 常规 → 勾「使用最高权限运行」 |

看进程在不在跑(任意一个 PowerShell):

```powershell
Get-Process python -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, StartTime, Path
```

强制重启一次:

```powershell
schtasks /end /tn "GameOps Crawler Executor"
schtasks /run /tn "GameOps Crawler Executor"
```

---

## 运行时关键行为(给会调代码的人看)

### 仓库克隆位置

clone 到 `<WORK_ROOT>/job-<jobId>/<repoName>/`。
**保留原仓库目录名** 是为了兼容 `from <repoName> import xxx` 这种依赖目录名的 Python 项目布局(很多脚本用 `sys.path.insert(0, Path(__file__).parent.parent)` + `from foo import bar`)。

### Git SSH 鉴权

`executor.py` 启动时注入 `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes"`:
- `accept-new`:首次见的主机自动加 known_hosts,之后还是严格校验(安全)
- `BatchMode=yes`:认证失败立即报错,不会停下来问密码(防卡死)

私库要么挂 GitHub Deploy Key(推荐,只读权限范围最小),要么把 PAT 写进 Job.repoUrl 里(HTTPS 模式)。

### 子进程 env 注入

```python
child_env = {
    **os.environ,
    "PYTHONIOENCODING": "utf-8",   # Python 自身输出 UTF-8
    "PYTHONUTF8": "1",             # Python 3.7+ UTF-8 模式
    "NO_COLOR": "1",               # loguru/rich/colorama 自觉关 ANSI 颜色
    "TERM": "dumb",                # 老派关颜色信号
    **paramValues_as_str_dict,     # 所有 paramValues,list/dict 用 json.dumps
}
```

paramValues 注入是脚本读参数的**首选方式**(命令模板 `{{var}}` 也支持但更繁琐)。脚本里:

```python
import json, os
start_date = os.environ["开始时间"]            # DATE/STRING/NUMBER/ENUM 直接读字符串
rows = json.loads(os.environ["指定uid"])      # EXCEL 类型用 json.loads 还原数组
```

### 子进程输出处理

逐行读 stdout/stderr:
1. UTF-8 解码 → 失败 fallback 系统 locale(中文 Windows 是 GBK)→ 再失败 replace
2. 正则剥 ANSI 转义码(`\x1b\[...m` / OSC 序列)
3. 重新 UTF-8 编码后既写本机 stdout(executor.log)也推中台 `/log`

### 取消传导

中台取消任务 → `/log` 端点对该 task 4xx →
1. 主 pump 线程推 log 拿到 4xx → `cancel_event.set()`
2. 即便子进程沉默,watchdog 每 5s 空 POST `/log` 也能拿到 4xx
3. 主轮询每秒 `proc.wait(timeout=1)` 检查 `cancel_event`:set 了 → `proc.kill()` → 抛 `TaskCanceledError`
4. handle_task 捕获后**不上报 result**(中台已是终态,/result 也会被拒)

整个链路 < 5 秒响应。

### 产物收集

`collect_outputs` 两种 path:
- **字面量**:`out/foo.csv` 必须存在;`optional: true` 时可跳
- **glob**:`数据/*总表.csv` 用 `Path.glob` 展开;0 匹配 → 失败(除非 optional)

每个产物上传时附带它的 `csvType`(可为 None):
- 非 None → 中台落 `data/raw/<csvType>/`,跑 parser/snapshot
- None → 中台落 `data/raw/_uncategorized/`,只留底不解析

### 网络错误兜底

`requests.exceptions.ConnectionError / Timeout / SSL / 5xx HTTPError` 都视为瞬时错,只 WARN 一行,10s 后重试。其它异常打全 traceback。

适配 `trycloudflare.com` 这种临时隧道掉链子的情况,日志不会被 traceback 刷爆。

---

## 升级 / 改代码后

直接覆盖 `.py` / `.bat` 文件即可。

- **heartbeat 改了**:1 分钟内下一次触发就吃到新代码,无需操作
- **executor 改了**:`schtasks /end` 把当前进程杀掉,任务计划会按"失败重启"在 1 分钟内拉起新代码;或者手动 `schtasks /run`

如果 `requirements.txt` 加了包,在爬虫机:

```powershell
cd D:\crawler\agent-reference
.\.venv\Scripts\activate
pip install -r requirements.txt
schtasks /end /tn "GameOps Crawler Executor"
schtasks /run /tn "GameOps Crawler Executor"
```
