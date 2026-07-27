/**
 * 飞书长连接(WebSocket)客户端:接收 im.message.receive_v1 事件。
 * 相比 webhook 回调:本地/线上都只需出站公网,无需公网入口/内网穿透,SDK 内置加密与鉴权。
 * 在 instrumentation 里随中台进程启动(仅 nodejs runtime)。
 * 凭证更新使用双连接切换:新连接 ready 后原子替换旧连接,无需重启中台。
 *
 * 3s 规则:handler 必须尽快返回,否则飞书重推。故只登记去重 + 异步跑 Agent(不 await)。
 */
import { createHash } from "node:crypto";

import * as Lark from "@larksuiteoapi/node-sdk";

import { badRequest } from "@/lib/errors";
import {
  clearFeishuTokenCache,
  getFeishuAppConfig,
  type FeishuAppConfig,
} from "@/lib/feishu/app";
import { processFeishuMessage, type ParsedFeishuMessage } from "@/lib/feishu/inbound";

const CONNECT_TIMEOUT_MS = 20_000;
const CONFIG_POLL_INTERVAL_MS = 10_000;

// message_id 去重(飞书失败会重推)
const seen = new Set<string>();
function once(id?: string): boolean {
  if (!id) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 2000) seen.delete(seen.values().next().value as string);
  return true;
}

interface WsMessageData {
  message?: {
    message_id?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    mentions?: Array<{ key?: string; id?: { open_id?: string } }>;
  };
}

function parse(data: WsMessageData): ParsedFeishuMessage | null {
  const m = data.message;
  if (!m || m.message_type !== "text" || !m.chat_id) return null;
  let text = "";
  try {
    text = (JSON.parse(m.content ?? "{}") as { text?: string }).text ?? "";
  } catch {
    /* ignore */
  }
  const mentions = m.mentions ?? [];
  for (const mt of mentions) if (mt.key) text = text.split(mt.key).join(" ");
  const mentionOpenIds = mentions
    .map((mt) => mt.id?.open_id)
    .filter((v): v is string => !!v);
  return {
    chatId: m.chat_id,
    chatType: m.chat_type ?? "group",
    text: text.trim(),
    mentionOpenIds,
  };
}

export type SDKConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type FeishuWSState =
  | SDKConnectionState
  | "disabled"
  | "unconfigured"
  | "switching";

export interface FeishuWSStatus {
  state: FeishuWSState;
  lastError: string;
  changedAt: string;
  reconnectAttempts: number;
}

export interface FeishuWSClient {
  start(params: { eventDispatcher: Lark.EventDispatcher }): Promise<void>;
  close(params?: { force?: boolean }): void;
  getConnectionStatus(): {
    state: SDKConnectionState;
    reconnectAttempts: number;
  };
}

export interface FeishuWSLifecycle {
  onReady: () => void;
  onError: (err: Error) => void;
  onReconnecting: () => void;
  onReconnected: () => void;
}

export type FeishuWSClientFactory = (
  cfg: FeishuAppConfig,
  lifecycle: FeishuWSLifecycle,
) => FeishuWSClient;

interface ManagedClient {
  client: FeishuWSClient;
  credentialKey: string;
  activated: boolean;
}

const createSDKClient: FeishuWSClientFactory = (cfg, lifecycle) =>
  new Lark.WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    handshakeTimeoutMs: 10_000,
    ...lifecycle,
  });

function credentialKey(cfg: FeishuAppConfig): string {
  return createHash("sha256")
    .update(cfg.appId)
    .update("\0")
    .update(cfg.appSecret)
    .digest("hex");
}

function messageHandler(data: unknown): void {
  const d = data as WsMessageData;
  if (!once(d.message?.message_id)) return;
  const parsed = parse(d);
  if (parsed) {
    void processFeishuMessage(parsed).catch((err) =>
      console.error("[feishu-ws] inbound", err),
    );
  }
}

export class FeishuWSManager {
  private active: ManagedClient | null = null;
  private baseState: FeishuWSState = "idle";
  private lastError = "";
  private changedAt = new Date().toISOString();
  private switching = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private operation: Promise<void> = Promise.resolve();

  constructor(
    private readonly clientFactory: FeishuWSClientFactory = createSDKClient,
  ) {}

  getStatus(): FeishuWSStatus {
    const sdkStatus = this.active?.client.getConnectionStatus();
    return {
      state: this.switching
        ? "switching"
        : sdkStatus?.state ?? this.baseState,
      lastError: this.lastError,
      changedAt: this.changedAt,
      reconnectAttempts: sdkStatus?.reconnectAttempts ?? 0,
    };
  }

  startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.syncFromDatabase("poll").catch((err) =>
        console.error("[feishu-ws] 配置轮询热更新失败", err),
      );
    }, CONFIG_POLL_INTERVAL_MS);
    this.pollTimer.unref?.();
  }

  async syncFromDatabase(reason: "startup" | "poll"): Promise<void> {
    const cfg = await getFeishuAppConfig();
    await this.runExclusive(async () => {
      await this.applyConfig(cfg, undefined, reason);
    });
  }

  /**
   * 本进程内的原子配置更新:
   * 1. 先用新凭证建立候选连接;
   * 2. ready 后执行 persist;
   * 3. 激活候选连接并关闭旧连接。
   *
   * persist 失败或新连接失败时旧连接保持不变。
   */
  async reconfigure(
    cfg: FeishuAppConfig,
    persist: () => Promise<void>,
  ): Promise<FeishuWSStatus> {
    await this.runExclusive(async () => {
      await this.applyConfig(cfg, persist, "api");
    });
    return this.getStatus();
  }

  private async applyConfig(
    cfg: FeishuAppConfig | null,
    persist: (() => Promise<void>) | undefined,
    reason: "startup" | "poll" | "api",
  ): Promise<void> {
    if (!cfg || !cfg.appId || !cfg.appSecret) {
      if (cfg?.enabled) {
        throw badRequest("启用飞书长连接前必须填写 App ID 和 App Secret");
      }
      if (persist) await persist();
      this.closeActive();
      this.setBaseState(cfg ? "disabled" : "unconfigured");
      return;
    }

    if (!cfg.enabled) {
      if (persist) await persist();
      clearFeishuTokenCache();
      this.closeActive();
      this.setBaseState("disabled");
      console.log(`[feishu-ws] 已停用(${reason})`);
      return;
    }

    const nextKey = credentialKey(cfg);
    const activeState = this.active?.client.getConnectionStatus().state;
    const activeIsUsable =
      activeState === "connected" ||
      activeState === "connecting" ||
      activeState === "reconnecting";
    if (
      this.active?.credentialKey === nextKey &&
      activeIsUsable
    ) {
      if (persist) await persist();
      return;
    }

    this.switching = true;
    this.touch();
    let candidate: ManagedClient | null = null;
    let candidateReady = false;
    try {
      candidate = await this.connectCandidate(cfg, nextKey);
      candidateReady = true;
      if (persist) await persist();
      clearFeishuTokenCache();

      const previous = this.active;
      candidate.activated = true;
      this.active = candidate;
      this.lastError = "";
      this.baseState = "connected";
      this.touch();
      previous?.client.close();
      console.log(`[feishu-ws] 长连接已热更新(${reason})`);
    } catch (err) {
      candidate?.client.close({ force: true });
      if (!candidateReady) {
        this.lastError = err instanceof Error ? err.message : String(err);
        if (!this.active) this.baseState = "failed";
        this.touch();
      }
      if (persist && !candidateReady) {
        throw badRequest(`飞书长连接验证失败:${this.lastError}`);
      }
      throw err;
    } finally {
      this.switching = false;
      this.touch();
    }
  }

  private async connectCandidate(
    cfg: FeishuAppConfig,
    nextKey: string,
  ): Promise<ManagedClient> {
    let managed: ManagedClient;
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((err: Error) => void) | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const client = this.clientFactory(cfg, {
      onReady: () => resolveReady?.(),
      onError: (err) => {
        if (!managed?.activated) {
          rejectReady?.(err);
          return;
        }
        this.lastError = err.message;
        this.baseState = "failed";
        this.touch();
      },
      onReconnecting: () => {
        if (managed?.activated) {
          this.baseState = "reconnecting";
          this.touch();
        }
      },
      onReconnected: () => {
        if (managed?.activated) {
          this.lastError = "";
          this.baseState = "connected";
          this.touch();
        }
      },
    });
    managed = { client, credentialKey: nextKey, activated: false };

    const dispatcher = new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data) => {
        // 候选连接尚未正式接管时返回失败,让飞书按重推机制稍后再投递。
        if (!managed.activated) {
          throw new Error("Feishu WebSocket credential switch in progress");
        }
        messageHandler(data);
      },
    });

    void client.start({ eventDispatcher: dispatcher }).catch((err: unknown) => {
      rejectReady?.(err instanceof Error ? err : new Error(String(err)));
    });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`连接超时(${CONNECT_TIMEOUT_MS / 1000}s)`)),
            CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
      return managed;
    } catch (err) {
      client.close({ force: true });
      throw err;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private closeActive(): void {
    this.active?.client.close();
    this.active = null;
  }

  private setBaseState(state: FeishuWSState): void {
    this.baseState = state;
    this.lastError = "";
    this.touch();
  }

  private touch(): void {
    this.changedAt = new Date().toISOString();
  }

  private async runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.operation.then(work, work);
    this.operation = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

const globalStore = globalThis as typeof globalThis & {
  __gameOpsFeishuWSManager?: FeishuWSManager;
};
const manager =
  globalStore.__gameOpsFeishuWSManager ??
  (globalStore.__gameOpsFeishuWSManager = new FeishuWSManager());

/** 启动配置监听。连接失败不阻塞中台 readiness,后台会持续轮询恢复。 */
export function startFeishuWS(): void {
  manager.startPolling();
  void manager.syncFromDatabase("startup").catch((err) =>
    console.error("[feishu-ws] 启动失败", err),
  );
}

export function getFeishuWSStatus(): FeishuWSStatus {
  return manager.getStatus();
}

export async function reconfigureFeishuWS(
  cfg: FeishuAppConfig,
  persist: () => Promise<void>,
): Promise<FeishuWSStatus> {
  return manager.reconfigure(cfg, persist);
}
