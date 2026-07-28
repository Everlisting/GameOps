import { describe, it, expect } from "vitest";

import { assembleFields, capRecordSize } from "./assemble";
import { REDACTED } from "./redact";

describe("assembleFields", () => {
  it("已知业务键放顶层,未知键进 fields 桶", () => {
    const out = assembleFields("agent.task", { event: "e", taskId: "t1", foo: "bar" }, undefined);
    expect(out.module).toBe("agent.task");
    expect(out.event).toBe("e");
    expect(out.taskId).toBe("t1");
    expect(out.fields).toEqual({ foo: "bar" });
  });

  it("fields 桶里的敏感键被脱敏", () => {
    const out = assembleFields("m", { appSecret: "shh", note: "ok" }, undefined);
    const fields = out.fields as Record<string, unknown>;
    expect(fields.appSecret).toBe(REDACTED);
    expect(fields.note).toBe("ok");
  });

  it("err 归一化到 err 字段", () => {
    const out = assembleFields("m", { err: new Error("boom") }, undefined);
    const err = out.err as { name?: string; message?: string };
    expect(err.name).toBe("Error");
    expect(err.message).toBe("boom");
  });

  it("原始身份键(userId/chatId/username...)一律丢弃", () => {
    const out = assembleFields("m", { userId: "u1", chatId: "c1", username: "alice", event: "e" }, undefined);
    expect("userId" in out).toBe(false);
    expect("chatId" in out).toBe(false);
    expect("username" in out).toBe(false);
    expect(out.fields).toBeUndefined();
    expect(out.event).toBe("e");
  });

  it("并入链路上下文,调用点同名字段覆盖上下文", () => {
    const out = assembleFields(
      "m",
      { requestId: "r2" },
      { requestId: "r1", role: "OPERATOR", userIdHash: "h" },
    );
    expect(out.requestId).toBe("r2"); // 调用点赢
    expect(out.role).toBe("OPERATOR");
    expect(out.userIdHash).toBe("h");
  });

  it("persist 仅在 true 时透传", () => {
    expect(assembleFields("m", { persist: true }, undefined).persist).toBe(true);
    expect("persist" in assembleFields("m", { persist: false }, undefined)).toBe(false);
  });
});

describe("capRecordSize", () => {
  it("超 32KB → 丢 fields 桶并标 truncated", () => {
    const emit: Record<string, unknown> = { module: "m", fields: { blob: "x".repeat(40 * 1024) } };
    capRecordSize(emit, "hi");
    expect(emit.fields).toBe("[record-truncated]");
    expect(emit.truncated).toBe(true);
  });
  it("正常大小不动", () => {
    const emit: Record<string, unknown> = { module: "m", fields: { a: 1 } };
    capRecordSize(emit, "hi");
    expect(emit.fields).toEqual({ a: 1 });
    expect(emit.truncated).toBeUndefined();
  });
});
