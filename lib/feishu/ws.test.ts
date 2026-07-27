import { describe, expect, it, vi } from "vitest";

import type { FeishuAppConfig } from "@/lib/feishu/app";
import {
  FeishuWSManager,
  type FeishuWSClient,
  type FeishuWSClientFactory,
  type FeishuWSLifecycle,
  type SDKConnectionState,
} from "@/lib/feishu/ws";

function config(appId: string, enabled = true): FeishuAppConfig {
  return {
    appId,
    appSecret: `secret-${appId}`,
    verificationToken: "",
    encryptKey: "",
    enabled,
  };
}

class FakeClient implements FeishuWSClient {
  private state: SDKConnectionState = "idle";

  constructor(
    private readonly id: string,
    private readonly lifecycle: FeishuWSLifecycle,
    private readonly events: string[],
    private readonly error?: Error,
  ) {}

  async start(): Promise<void> {
    this.events.push(`start:${this.id}`);
    if (this.error) {
      this.state = "failed";
      this.lifecycle.onError(this.error);
      return;
    }
    this.state = "connected";
    this.events.push(`ready:${this.id}`);
    this.lifecycle.onReady();
  }

  close(params: { force?: boolean } = {}): void {
    this.events.push(`close:${this.id}:${params.force === true ? "force" : "graceful"}`);
    this.state = "idle";
  }

  getConnectionStatus(): {
    state: SDKConnectionState;
    reconnectAttempts: number;
  } {
    return { state: this.state, reconnectAttempts: 0 };
  }
}

describe("FeishuWSManager", () => {
  it("新连接 ready 并持久化后才关闭旧连接", async () => {
    const events: string[] = [];
    const factory: FeishuWSClientFactory = (cfg, lifecycle) =>
      new FakeClient(cfg.appId, lifecycle, events);
    const manager = new FeishuWSManager(factory);

    await manager.reconfigure(config("cli_1111111111111111"), async () => {
      events.push("persist:first");
    });
    events.length = 0;

    await manager.reconfigure(config("cli_2222222222222222"), async () => {
      events.push("persist:second");
    });

    expect(events).toEqual([
      "start:cli_2222222222222222",
      "ready:cli_2222222222222222",
      "persist:second",
      "close:cli_1111111111111111:graceful",
    ]);
    expect(manager.getStatus().state).toBe("connected");
  });

  it("候选连接失败时不保存配置且保留旧连接", async () => {
    const events: string[] = [];
    const factory: FeishuWSClientFactory = (cfg, lifecycle) =>
      new FakeClient(
        cfg.appId,
        lifecycle,
        events,
        cfg.appId === "cli_2222222222222222"
          ? new Error("invalid credential")
          : undefined,
      );
    const manager = new FeishuWSManager(factory);
    await manager.reconfigure(config("cli_1111111111111111"), async () => undefined);
    events.length = 0;
    const persist = vi.fn(async () => undefined);

    await expect(
      manager.reconfigure(config("cli_2222222222222222"), persist),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(persist).not.toHaveBeenCalled();
    expect(events).toEqual([
      "start:cli_2222222222222222",
      "close:cli_2222222222222222:force",
    ]);
    expect(manager.getStatus()).toMatchObject({
      state: "connected",
      lastError: "invalid credential",
    });
  });

  it("停用时先持久化再关闭连接", async () => {
    const events: string[] = [];
    const factory: FeishuWSClientFactory = (cfg, lifecycle) =>
      new FakeClient(cfg.appId, lifecycle, events);
    const manager = new FeishuWSManager(factory);
    await manager.reconfigure(config("cli_1111111111111111"), async () => undefined);
    events.length = 0;

    await manager.reconfigure(
      config("cli_1111111111111111", false),
      async () => {
        events.push("persist:disabled");
      },
    );

    expect(events).toEqual([
      "persist:disabled",
      "close:cli_1111111111111111:graceful",
    ]);
    expect(manager.getStatus().state).toBe("disabled");
  });
});
