import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 掉真实 DB 层,捕获 createMany 的入参(vi.hoisted 保证在 vi.mock 提升前已初始化)
const { createMany } = vi.hoisted(() => ({
  createMany: vi.fn(async (_args: { data: unknown[] }) => ({ count: 0 })),
}));

/** 取第一次 createMany 调用的 data 数组。 */
function firstBatch(): Array<Record<string, unknown>> {
  const call = createMany.mock.calls[0];
  if (!call) throw new Error("createMany 未被调用");
  return call[0].data as Array<Record<string, unknown>>;
}
vi.mock("@/lib/logger/error-log-db", () => ({ errorLogDb: { createMany } }));

import { enqueueErrorLog, type PersistInput } from "./error-db";

function input(overrides: Partial<PersistInput> = {}): PersistInput {
  return {
    occurredAt: "2026-07-28T00:00:00.000Z",
    level: "error",
    service: "gameops-web",
    environment: "test",
    module: "harness",
    event: "harness.boom",
    msg: "boom",
    err: { name: "Error", message: "boom", stack: "Error: boom\n    at foo (a.ts:1:1)" },
    ...overrides,
  };
}

beforeEach(() => createMany.mockClear());

describe("error-db sink", () => {
  it("入队满 BATCH 触发批量写,行含指纹/映射字段", async () => {
    for (let i = 0; i < 50; i++) enqueueErrorLog(input({ requestId: `r${i}` }));
    await vi.waitFor(() => expect(createMany).toHaveBeenCalled());
    const rows = firstBatch();
    expect(rows.length).toBe(50);
    const row = rows[0];
    expect(row.occurredAt).toBeInstanceOf(Date);
    expect(row.level).toBe("error");
    expect(row.errName).toBe("Error");
    expect(row.errStack).toContain("foo");
    expect(typeof row.fingerprint).toBe("string");
    expect((row.fingerprint as string).length).toBe(32);
    expect(row.requestId).toBe("r0");
  });

  it("同类错误指纹一致,不同栈顶帧指纹不同", async () => {
    // 49 条相同 + 1 条不同栈顶
    for (let i = 0; i < 49; i++) enqueueErrorLog(input());
    enqueueErrorLog(input({ err: { name: "Error", message: "x", stack: "Error: x\n    at bar (b.ts:9:9)" } }));
    await vi.waitFor(() => expect(createMany).toHaveBeenCalled());
    const rows = firstBatch();
    const fps = new Set(rows.map((r) => r.fingerprint));
    expect(fps.size).toBe(2); // 同类合一 + 异栈另计
  });
});
