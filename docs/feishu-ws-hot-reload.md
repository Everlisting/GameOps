# 飞书长连接凭证热更新

## 目标

管理员更新飞书自建应用 `App ID / App Secret / enabled` 后，不重启 Next.js
进程即可切换 WebSocket 长连接，同时避免错误凭证覆盖当前可用连接。

## 切换流程

```text
管理员保存
  → 合并数据库旧配置与本次部分更新
  → 使用新凭证创建候选 WSClient
  → 等待 onReady（最长 20 秒）
  → 保存加密凭证并清空 tenant_access_token 缓存
  → 激活候选连接
  → close() 旧连接
```

- 候选连接验证失败：不写库，旧连接继续工作，API 返回可读错误。
- 数据库写入失败：强制关闭候选连接，旧连接继续工作。
- 关闭 `enabled`：先写库，再关闭当前连接。
- 只改非连接字段且凭证未变：不重连。
- 候选连接 ready 但尚未激活时若收到事件，handler 返回失败，使飞书按官方机制重推，
  避免切换窗口静默丢事件。

## 多实例

每个进程在启动时创建一个进程级连接管理器，并每 10 秒读取一次数据库配置。
处理保存请求的实例会立即切换；其他实例最多 10 秒后同步切换。

飞书长连接为集群投递，同一事件只随机投递给其中一个客户端。每个应用最多 50 个连接。
双连接切换期间每个实例会短暂占用两个连接，因此采用当前方案时中台实例数应不超过 25。
若未来超过该规模，应把长连接拆成独立 worker，并通过 leader election 保证连接数量。

## 运行状态

管理员飞书配置页展示本进程的状态：

- `connected`：在线
- `switching / connecting / reconnecting`：切换或恢复中
- `failed`：无可用连接且连接失败
- `disabled / unconfigured`：已停用或未配置

SDK 自身负责断线自动重连；连接管理器使用 `onReady`、`onError`、
`onReconnecting`、`onReconnected` 和 `getConnectionStatus()` 暴露状态。

## 生产边界

- 当前 `message_id` 去重集合是进程内存级。多实例部署若要求严格的跨实例幂等，
  应增加 PostgreSQL/Redis 事件收件箱并对事件唯一键建立唯一约束。
- 热更新依赖常驻 Node.js 进程。Serverless/按请求启动的运行环境应将飞书长连接拆为常驻 worker。
- `@larksuiteoapi/node-sdk` 必须保持为 Next.js server external，不能打进 Edge bundle。
