# 爬虫机与采集任务快速接入

> 面向管理员与运维的操作手册。HTTP 字段和状态机请查
> [`agent-protocol.md`](./agent-protocol.md)。
>
> 目标流程:中台创建机器 → 爬虫机执行一条安装命令 → 中台确认就绪。

## 一、部署前准备

Windows 爬虫机只需满足:

- 能主动访问中台 HTTPS 地址,不需要公网 IP、端口映射或 cloudflared。
- 已安装 Python 3.10+ 和 Git for Windows,且 `python` / `git` 已加入 PATH。
- 使用管理员 PowerShell 执行安装命令。

## 二、创建并部署爬虫机

### 1. 在中台创建

管理员进入「管理面板 → 爬虫机 → 新建机器」,填写一个唯一机器名并创建。

创建成功后 Token 只显示一次。建议直接点击「复制安装命令」,不要手工拆分
`agentId` 和 `secret`。

### 2. 在 Windows 端安装

把项目中的整个 `agent-reference/` 目录复制到爬虫机,例如:

```text
D:\crawler\agent-reference
```

在该目录打开管理员 PowerShell,粘贴中台生成的命令:

```powershell
.\install.cmd `
  -BaseUrl "https://gameops.example.com" `
  -Token "<agentId>.<secret>"
```

`install.cmd` 是 Windows 10 / 11 通用入口。它只为本次 Windows PowerShell 5.1
进程设置 `ExecutionPolicy Bypass`,不会修改机器的永久执行策略。底层 `.ps1` 保持纯
ASCII,避免不同系统代码页造成脚本乱码。

开发期如果使用 TryCloudflare 临时隧道,`BaseUrl` 只填写它生成的 HTTPS 地址,
不要在 `trycloudflare.com` 后追加本机的 `:3000`。Quick Tunnel 地址重启后可能变化,
只建议用于联调。

安装脚本自动完成:

1. 检查管理员权限、Python 版本和 Git。
2. 创建全新的 `.venv` 并安装 Agent 依赖。
3. 写入 `.env`。
4. 发送一次真实心跳进行鉴权验证。
5. 注册并启动唯一计划任务 `GameOps Crawler Agent`。

安装脚本不会复用已有 `.venv`。检测到同名环境时会提示确认,默认选择否并退出;
只有输入 `y` 或 `yes` 才会停止现有 Agent、删除旧环境并重新创建。

不再编辑 XML,也不再分别维护 Heartbeat / Executor 两个计划任务。

### 3. 回中台确认

进入该爬虫机详情页,确认:

- 状态为「在线」。
- 「独立心跳」已有时间。
- 执行器为 `idle` 或 `busy`。
- Agent、Python、Git 版本均已显示。

Windows 端也可随时运行:

```powershell
.\status.cmd
```

## 三、创建并运行采集任务

管理员进入「采集任务 → 新建任务」。

### 必填配置

| 字段 | 说明 |
| --- | --- |
| 任务名称 | 给运营识别的名称 |
| 爬虫机 | 选择已在线、未停用的机器 |
| 复用已有仓库 | 选择该爬虫机用过的仓库,自动回填类型、地址和分支 |
| 仓库地址 | Git 或 SVN 地址 |
| 工作目录 | 相对仓库根;默认 `.` |
| 执行命令 | 如 `python scripts/run.py` |

新建 Job 时先选爬虫机。若「复用已有仓库」中已有目标仓库,直接选择即可;
只有第一次使用某个仓库时才需要手动填写仓库类型、地址和分支。

同一爬虫机上的 Job 如果使用相同仓库地址,Agent 只保留一份共享工作副本。
例如所有爬虫都在 `data-hub` 仓库时,每个 Job 复用同一仓库,只需把工作目录分别写成:

```text
crawlers/anchor_pipeline
crawlers/slg_public
services/example_crawler
```

每次运行仍会更新共享仓库并切换到 Job 指定分支,然后进入对应工作目录执行命令。

任务参数会全部自动注入脚本环境变量。脚本可直接读取:

```python
import os
start_date = os.environ["开始时间"]
```

只有确实需要命令行参数时,才在命令里写 `{{开始时间}}`。

### 产物处理方式

Agent 会上传所有声明且匹配的产物:

- 选择 csvType:归档并执行 parser / snapshot。
- 选择「仅归档,不解析」:保存到 `_uncategorized`,仍可在数据集页下载。
- 勾选「可选」:无匹配时不让任务失败。

### 保存与运行

- 新建完成后直接进入采集任务详情,无需回列表重新查找。
- 修改已有任务时,有未保存改动会禁止运行;先保存后再运行。
- Task 创建时会冻结当前 Job revision 和执行配置。之后编辑模板不会改变已排队任务。
- Agent 在启动脚本前还会冻结实际 Git commit / SVN revision 与 Python 依赖指纹。
- 「按原版本重跑」会使用原 Task 的配置、参数和源码 revision,不会执行分支最新代码。
- 重跑时若 Agent、OS、Python、Git、依赖或命令指纹与原执行不同,任务会失败并列出漂移项;要使用新环境请从 Job 页面重新运行。

`启用采集任务` 是总开关;关闭后手动、重跑、定时均不可执行。
`启用定时` 只控制 cron;关闭后仍可手动运行。

## 四、故障排查

| 现象 | 处理 |
| --- | --- |
| 安装提示需要管理员权限 | 关闭窗口,重新以管理员身份打开 PowerShell |
| 找不到 Python / Git | 安装后重新打开 PowerShell,执行 `python --version` / `git --version` |
| 心跳返回 401 | Token 不完整或已重置;在中台重置 Token 后重新执行安装 |
| 心跳返回 403 | 爬虫机已停用;在中台恢复为启用 |
| 中台显示在线但 Job 拉仓库失败 | 在同一 Windows 用户下手工 `git clone` 验证 SSH key / HTTPS 凭据 |
| Task 一直 PENDING | 检查绑定机器是否在线、停用或已有 RUNNING 任务 |
| Task 是 FAILED | 进入运行详情看日志;仓库同步、命令退出、超时、必需产物缺失都会失败 |
| 产物未解析 | 检查处理方式是否为正确 csvType,并查看数据集的 `parseError` |

## 五、升级与卸载

覆盖 `agent.py`、`executor.py`、`repo_workspace.py` 等程序文件后,重启唯一计划任务。
P3 可复现执行要求中台爬虫机详情显示 Agent 版本 `0.5.0` 或更高:

```powershell
Stop-ScheduledTask -TaskName "GameOps Crawler Agent"
Start-ScheduledTask -TaskName "GameOps Crawler Agent"
```

中台会拒绝 `0.4.x` 及更早版本继续领取任务。升级文件并重启后,等待下一次心跳
显示 `0.5.0`,再运行新的采集任务。

卸载计划任务:

```powershell
.\uninstall.cmd
```

同时删除本机 Token 配置:

```powershell
.\uninstall.cmd -RemoveConfig
```

卸载不会删除 `workspaces/` 和 `logs/`,便于排障和恢复。
