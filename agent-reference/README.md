# GameOps Crawler Agent（Windows）

这是可直接部署到 Windows 爬虫机的参考 Agent。部署入口已收敛为:

```text
install.cmd → install.ps1 → agent.py → 心跳线程 + executor 主循环
```

Windows 只注册一个计划任务:`GameOps Crawler Agent`。

## 快速安装

前置条件:

- Python 3.10+
- Git for Windows
- 管理员 PowerShell

把整个目录复制到目标机器,在目录内执行:

```powershell
.\install.cmd `
  -BaseUrl "https://gameops.example.com" `
  -Token "<agentId>.<secret>"
```

安装脚本会自动:

1. 创建全新的 `.venv`;如果同名环境已存在,先提示确认,确认后删除并重建。
2. 安装 `requirements.txt`。
3. 写入 `.env`。
4. 发送心跳 smoke test。
5. 注册并启动唯一常驻计划任务。

安装脚本不会复用已有 `.venv`。检测到已有环境时默认取消;只有输入 `y` 或
`yes` 才会停止现有 Agent、删除 `.venv` 并继续安装。

可选指定工作区和日志目录:

```powershell
.\install.cmd `
  -BaseUrl "https://gameops.example.com" `
  -Token "<agentId>.<secret>" `
  -WorkRoot "D:\crawler\workspaces" `
  -LogDir "D:\crawler\logs"
```

## 状态检查

```powershell
.\status.cmd
```

也可单独验证中台鉴权和环境上报:

```powershell
.\.venv\Scripts\python.exe .\heartbeat.py
```

## 文件结构

```text
agent-reference/
├─ install.cmd       # Win10 / Win11 通用入口,仅本进程绕过 Execution Policy
├─ install.ps1       # 安装、验证并注册单一计划任务
├─ status.cmd        # 通用状态检查入口
├─ status.ps1        # 查看任务状态和最近日志
├─ uninstall.cmd     # 通用卸载入口
├─ uninstall.ps1     # 移除计划任务
├─ agent.py          # 唯一常驻入口
├─ executor.py       # claim / sync / run / upload
├─ repo_workspace.py # 按仓库 URL 生成共享工作区
├─ heartbeat.py      # 一次性心跳 smoke test
├─ common.py         # 配置、HTTP Session、日志
├─ requirements.txt
├─ .env.example
├─ .env              # 真实 Token,禁止提交
├─ workspaces/       # 按仓库 URL 复用的工作区
└─ logs/
   ├─ agent.log
   ├─ executor.log
   └─ heartbeat.log
```

## 运行模型

`agent.py` 启动两个互不阻塞的职责:

- 后台线程每 60 秒发送 heartbeat,上报 idle/busy、Agent 版本、主机名、
  Python/Git 版本和基础诊断。
- 主线程运行 executor,串行领取本机任务并执行。

长任务不会阻塞心跳。同一 Agent 的并发仍由中台保证为 1。

Task 返回的 `job` 是创建时冻结的配置快照,不会被之后的 Job 编辑改变。
Agent 0.5.0 起还会在命令启动前冻结实际 Git commit / SVN revision、Python
依赖指纹和运行环境。已带 `sourceRevision` 的重新排队 / 重跑任务会检出该精确
revision,不会跟随分支最新代码;Agent/OS/Python/Git/依赖/命令指纹发生漂移时
拒绝执行。需要使用新环境时应从 Job 手动发起一次新执行。

## 仓库与参数

仓库克隆到:

```text
<WORK_ROOT>/repos/<repoType>-<normalized-url-hash>/<repoName>/
```

相同 `repoType + repoUrl` 的 Job 共用这一份工作副本,不会因 Job ID 不同重复
clone。首次任务会 fetch/update 并解析实际 revision;后续重跑会在执行前切到
Task 已冻结的 revision。
`job.workdir` 是相对仓库根的执行目录,例如多个爬虫整合在 `data-hub` 时可分别写
`crawler/douyin`、`crawler/xhs`。

升级前已经存在的 `<WORK_ROOT>/job-<jobId>/<repoName>/` 会在首次命中时迁移到
共享目录;其余未命中的旧目录不会自动删除,确认不再使用后可人工清理。

所有 `paramValues` 都会注入子进程环境变量。list / dict 会编码为 JSON:

```python
import json
import os

start_date = os.environ["开始时间"]
rows = json.loads(os.environ["指定uid"])
```

命令模板 `{{参数名}}` 仍然支持,但环境变量是更简单的默认方式。

私有仓库请先在运行计划任务的 Windows 用户下配置 SSH key 或 Git credential,
并手工 `git clone` 验证一次。

## 产物

- `csvType` 非空:上传、归档并解析。
- `csvType` 为空:上传到 `_uncategorized`,只归档不解析。
- `optional=true`:路径或 glob 无匹配时跳过。

## 升级

覆盖 `agent.py`、`executor.py`、`repo_workspace.py` 等程序文件;如依赖有变化,
先执行:

```powershell
.\.venv\Scripts\python.exe -m pip install -r .\requirements.txt
```

然后重启:

```powershell
Stop-ScheduledTask -TaskName "GameOps Crawler Agent"
Start-ScheduledTask -TaskName "GameOps Crawler Agent"
```

## 卸载

```powershell
.\uninstall.cmd
```

加 `-RemoveConfig` 会额外删除 `.env`;工作区和日志始终保留。
