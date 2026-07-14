# 爬虫 / 分析项目合并方案(monorepo）

> 状态:**方案存档,未执行**。
> 决策时间:2026-07-09。
> 决策人:项目负责人。
> 目标:把散落的爬虫 / 分析项目收敛到一个独立仓库,与中台(GameOps)分离。第一步先合并 `slg_analyzer` 与 `anchor_pipeline`,后续所有爬虫都并入。

---

## 0. 一句话结论

**可行。原则是「仓库合并,运行时隔离」** —— 一个 git 仓库里放多个各自独立部署的包,但**不共用** venv / 容器 / 进程。Docker 不是合并的障碍,它恰恰证明了各包运行模型不同,应该在同一仓库里保持各自独立的部署单元。

---

## 1. 现状盘点

### 1.1 两个项目其实都是「爬虫 + 分析」二合一

| 项目 | 爬虫部分 | 分析 / 服务部分 |
| --- | --- | --- |
| **anchor_pipeline** | `run.py` + `api/` + `core/`(DrissionPage 驱动真实 Chrome + ddddocr 过滑块,私域主播数据)→ 产 CSV | 无(纯采集 + 表格加工 `pipeline/`) |
| **slg_analyzer** | `src/scrapers/`(douyin / xiaohongshu / bilibili,Playwright + CDP + 滑块)+ `scripts/merge_platforms.py` → 产 `data/social_*.json` | `service/`(FastAPI,Docker 常驻)+ `src/analysis` / `src/public_report` / `src/combined_report`(LLM 舆情分析)→ 产 HTML/JSON |

关键事实:
- slg 的 **Docker 容器只跑分析**(`service/runner.py` 只调 `run_public / run_combined`,从不 import scrapers;Dockerfile 注释也写明"当前 service 不用抖音滑块")。
- slg 的**公域爬虫在容器外**跑,产出 `social_*.json` 再喂给容器分析。
- slg 的 scraper 与 analysis **共享** `src/config`、`src/models`、`src/loaders`、`config.yaml` —— 这是内部拆分的主要阻力。

### 1.2 运行形态对比

| 维度 | anchor_pipeline(爬虫) | slg_analyzer(分析服务) |
| --- | --- | --- |
| 运行形态 | 一次性子进程,跑完退出 | 常驻 FastAPI 服务 |
| 部署位置 | 爬虫机 Windows 内网(**需真浏览器**) | Docker 容器(纯计算 + LLM API) |
| 触发方 | agent `claim` → `git pull` → `python run.py` | 中台 REST 代理调用 `:8000` |
| 状态 | 无状态,产物 CSV | 有状态,SQLite `tasks.db` + 产物 HTML/JSON |
| 核心依赖 | DrissionPage / ddddocr / curl_cffi | anthropic / openai / jieba / jinja2 / fastapi |
| 与中台协议 | Agent 协议(git pull + env 注入 + CSV 回传) | REST + AES 加密 apiKey + downloader 拉产物 |

### 1.3 依赖冲突评估

- 两者都锁 `numpy<2`,opencv 版本区间兼容(slg `4.9~4.10`,anchor `>=4.5`)→ 理论上能共存。
- **但没必要塞一个 venv**:合并依赖会把 DrissionPage + ddddocr + Playwright + anthropic + openai + fastapi 全堆一起,放大冲突面。
- **结论:每个包各自 venv、各自 `requirements.txt`。** monorepo ≠ 共享 venv。

---

## 2. 已定决策

1. **slg 粒度:先 A 后 B。** 先整体平移跑通(方案 A),把内部拆分(方案 B)作为后续独立任务,仅当「公域爬虫需要接入 agent 统一调度」时才做。
2. **Git 历史:不保留。** 直接拷文件到新仓,从一个干净的初始提交开始。
3. **当前动作:先出书面方案存档(即本文件),暂不执行。**

---

## 3. 目标结构(方案 A,先落地这个)

```
data-hub/                          ← 新仓库(爬虫 + 分析总集,独立于 GameOps)
├── crawlers/                      ← 所有 agent 拉取的爬虫(裸机跑,需浏览器)
│   └── anchor_pipeline/           ← 原 anchor_pipeline,保留包名免动 import
│       ├── run.py                 ← Job.command = python crawlers/anchor_pipeline/run.py
│       └── requirements.txt       ← 独立依赖 + 独立 venv
├── services/                      ← 常驻服务(Docker 跑)
│   └── slg/                       ← 原 slg_analyzer 整体平移,内部结构不动
│       ├── service/               ← Docker 只跑这半(分析)
│       ├── src/scrapers/          ← 公域爬虫,本地/爬虫机手动跑,产 social_*.json
│       ├── src/analysis…          ← 分析逻辑
│       ├── Dockerfile
│       └── docker-compose.yml
├── libs/                          ← 【阶段 3 才建】公共代码(飞书通知 / CSV 工具等)
├── docs/
│   └── layout.md                  ← 说明两种消费方式(agent 拉 vs docker 起)
└── README.md
```

要点:
- **每包独立 venv、独立 requirements。**
- `crawlers/*` 的 `run.py` 保持「env 驱动 + 输出 CSV」契约不变 → agent 侧零改动。
- `services/slg` 整体平移,Dockerfile `context` 仍是它自己那层,`docker compose up` 照旧。
- anchor 保留包名 `anchor_pipeline`(它的 import 依赖目录名 = 包名,`run.py` 里有 `sys.path.insert` 逻辑),改动最小。

### 方案 B(阶段 3 可选,彻底拆分,供参考)

```
data-hub/
├── crawlers/
│   ├── anchor_pipeline/           ← DrissionPage 私域
│   └── slg_public/                ← 从 slg 抽出的 src/scrapers(Playwright 公域)
├── services/
│   └── slg_analyzer/              ← 只剩分析(analysis + reports + service + Docker)
└── libs/
    └── slg_common/                ← 抽出 config / models / loaders(scraper 与 analysis 共享)
```

代价:要重构 slg 的共享层(config/models/loaders)、改 import、重跑公域 + 对比两条报告链路回归。**这是真重构,不是搬文件。** 触发条件成立前不做(YAGNI)。

---

## 4. 分阶段落地步骤

### 阶段 1 — 建仓 + 搬 slg(风险最低,先做)

1. 新建 `data-hub` 仓,建 `crawlers/ services/ docs/`。
2. **直接拷文件**(不保留历史):把 `slg_analyzer/` 全量复制到 `services/slg/`。
3. 验证:`cd services/slg && docker compose up -d --build` → 容器起、`:8000` 健康检查过、跑一次公域/对比报告链路。
4. 更新中台 `GameOps/CLAUDE.md` 里 `cd F:\Kaifa\slg_analyzer && docker compose up` 那句,改成新路径。
   - **中台代码零改**(`ANALYSIS_BASE_URL=:8000` 不变)。

**验证标准:** 中台舆情监控三份报告(私域/公域/对比)在新路径的容器上都能正常触发并拉回产物。

### 阶段 2 — 搬 anchor_pipeline

1. **直接拷文件**:`anchor_pipeline/` → `crawlers/anchor_pipeline/`(保留包名)。
2. 在爬虫机上验证 `python crawlers/anchor_pipeline/run.py`(带 env)能跑通、出 CSV。
3. 中台 admin 里改这个 Job 的 `repoUrl`(指新仓)、`workdir`(`crawlers/anchor_pipeline`)、`command`。

**验证标准:** agent 领到该 Job → git pull 新仓 → 跑通 → CSV 正常回传入库。

### 阶段 3 —(可选)方案 B 拆分 slg

- 触发条件:公域爬虫要接入 agent 统一调度。
- 单独立项,带回归测试,拆 `src/config/models/loaders` 为 `libs/slg_common`。

### 阶段 4 — 后续新爬虫

- 一律 `crawlers/<name>/`,配一个 Job 指 `workdir=crawlers/<name>`。仓库结构自然扩展。

---

## 5. 中台(GameOps)侧需同步改的触点

| 触点 | 改什么 | 阶段 |
| --- | --- | --- |
| `GameOps/CLAUDE.md` 分析服务起法那句 | `cd F:\Kaifa\slg_analyzer` → 新路径 | 阶段 1 |
| 中台 admin → anchor 那个 Job | `repoUrl` / `workdir` / `command` | 阶段 2 |
| 分析服务 `ANALYSIS_BASE_URL` | **不用改**(仍 `:8000`) | — |

---

## 6. 风险 / 注意事项

- **不保留 git 历史** → 拷文件前确认两个源仓都已提交干净、无未推送改动;新仓初始提交后,旧仓可暂时保留只读一段时间作为回溯兜底,别马上删。
- **`.env` / 密钥不入库**:slg 的 `.env`(含 `ANALYSIS_SHARED_SECRET`)、anchor 的账号密码等,按各自 `.gitignore` 处理,拷文件时别把 `.env` 带进新仓提交。
- **各包独立 venv**:拷进去后每包重建虚拟环境,别复用旧的 `.slg_analyzer` / `.pipline`(路径写死会踩坑)。
- **Playwright 浏览器二进制**:slg 公域爬虫首次在新环境跑要 `playwright install`。
- **anchor 包名**:务必保留 `anchor_pipeline` 目录名,否则 `from anchor_pipeline import ...` 全崩。

---

## 7. 待办清单(执行时勾选)

> 执行进度(2026-07-09):新仓 `F:\Kaifa\data-hub` 已建,初始提交 `87dac25`。
> 两个源项目**未改动**;GameOps **未改动**(路径切换留待验证通过后再做)。
> 导入用 `git archive`(不留历史),自动排除密钥/venv;额外清理了误提交的 `.slg_analyzer` venv、`__pycache__/*.pyc`、本地私有配置、生成产物。

- [x] 阶段 1:建 `data-hub` 仓骨架(crawlers/ services/ docs/ + README + .gitignore)
- [x] 阶段 1:拷 slg → `services/slg/`(97 文件,密钥/venv 已排除)
- [x] 阶段 1:`docker compose up` 验证 `:8000`(临时 8001 验证 → 正式切换 total:0 全新 volume)
- [x] 阶段 1:更新 `GameOps/CLAUDE.md` 路径 → `data-hub\services\slg`
- [x] 阶段 2:拷 anchor → `crawlers/anchor_pipeline/`(54 文件,pyc 已清)
- [x] 阶段 2:anchor 导入冒烟通过(旧 venv 从新位置导 run.py,包名解析 OK)
- [x] 切换:停旧 slg 容器 → 新仓容器接管 `:8000`(旧 volume `slg_analyzer_opinion_data` 保留可回滚)
- [x] 切换:data-hub 推远程 `https://github.com/Everlisting/date_hub.git`(master)
- [x] 清理:旧 slg 仓 `git rm --cached .slg_analyzer` 已提交并 push
- [x] 阶段 2:中台 admin 改 anchor Job → repoUrl=date_hub.git、workdir=crawlers/anchor_pipeline、command=`python run.py`(DB 已核对)
- [x] 阶段 2:修分支不匹配 —— data-hub 由 `master` 改名 `main`(对齐 Job.repoBranch);远程 `master` 待你在 GitHub 改默认分支后删
- [x] 阶段 2:模拟 agent `git clone -b main` 验证 —— 入口 `crawlers/anchor_pipeline/run.py` + 各包在位,无密钥泄漏
- [x] 阶段 2:启用 agent A2
- [x] 阶段 2:配 date_hub 的 SSH deploy key + `~/.ssh/config` Host 别名 `github-datehub`,Job.repoUrl 改 `git@github-datehub:Everlisting/date_hub.git`(HTTPS/账户/别名踩坑记录见对话)
- [x] 阶段 2:**真实端到端跑通**(seq#50)—— SSH clone → crawlers/anchor_pipeline/run.py → 滑块登录成功 → 抓取中
- [ ] 阶段 2:确认本次 task 跑完 SUCCEEDED + CSV 按 outputs 回传入库(约 1 小时,历史成功跑约 57min)
- [x] 阶段 3:拆分 slg **完成**(`data-hub` commit abae710)
  - 采用简化版方案 B:**不建 `libs/slg_common`**,3 个共享文件(config/logging_setup/schema)各持一份;services 侧**保留 `services/slg` 原名**不改 slg_analyzer(免再切容器)。
  - `crawlers/slg_public/` = src/scrapers + scripts/fetch_* + merge_platforms + scraper 测试;保留 `src/`+`scripts/` 两层 → import 零改动。
  - 回归:拆分前后均 274 passed(slg_public 190 + services/slg 84);analyzer 镜像删 scrapers 后仍 build+/health 200(临时 :8001 验证)。
  - 尚未接 agent:slg_public 可被 agent 拉取运行(`workdir=crawlers/slg_public`,`python scripts/fetch_*.py`),需要时在中台建对应 Job。

### 迁移踩坑备忘(repoUrl 变更时必看)
- executor `sync_repo` 对已存在 checkout 只 `git fetch` 现有 remote,**不因 Job.repoUrl 改了就换 remote** → 改 repoUrl 必须连带删该 Job 工作区强制重 clone。
- executor `_run_check`(git clone/pull)**无 timeout** → 私有仓认证挂起会无限卡住 agent(并发=1 被占死),值得给它加超时。
- 私有仓 SSH:GitHub deploy key 是**单仓**范围(问候语 `Hi user/repo!`),一把公钥全站只能当一个仓的 deploy key;多仓要么各配 key+`~/.ssh/config` Host 别名(本次做法),要么用账号级 key。
- Win32 `ssh-keygen` 不展开 `~`(ssh 客户端会),生成 key 用 `$env:USERPROFILE` 全路径。
- key/config 必须放在 **executor 运行账户** 的 `.ssh`(本机 executor 在 `E:\clawler`,以用户 `111` 跑)。
