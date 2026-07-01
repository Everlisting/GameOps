import { describe, it, expect } from "vitest";
import {
  triggerFormSchema,
  triggerCombinedSchema,
  listQuerySchema,
  settingsUpdateSchema,
} from "./opinion";

describe("triggerFormSchema", () => {
  it("game 默认率土之滨", () => {
    const out = triggerFormSchema.parse({});
    expect(out.game).toBe("率土之滨");
    expect(out.coverageSpan).toBeUndefined();
  });

  it("空字符串 coverageSpan 归 undefined", () => {
    const out = triggerFormSchema.parse({ coverageSpan: "   " });
    expect(out.coverageSpan).toBeUndefined();
  });

  it("game 超 64 字符拒", () => {
    expect(() =>
      triggerFormSchema.parse({ game: "x".repeat(65) }),
    ).toThrow();
  });
});

describe("triggerCombinedSchema", () => {
  it("privateTaskId / publicTaskId 必填", () => {
    expect(() => triggerCombinedSchema.parse({})).toThrow();
    expect(() =>
      triggerCombinedSchema.parse({ privateTaskId: "a" }),
    ).toThrow();
  });

  it("拿到两个 id 成功", () => {
    const out = triggerCombinedSchema.parse({
      privateTaskId: "opn_a",
      publicTaskId: "opn_b",
    });
    expect(out.privateTaskId).toBe("opn_a");
    expect(out.publicTaskId).toBe("opn_b");
  });
});

describe("listQuerySchema", () => {
  it("默认 limit=100 offset=0", () => {
    const out = listQuerySchema.parse({});
    expect(out.limit).toBe(100);
    expect(out.offset).toBe(0);
  });

  it("coerce 字符串数字", () => {
    const out = listQuerySchema.parse({ limit: "5", offset: "10" });
    expect(out.limit).toBe(5);
    expect(out.offset).toBe(10);
  });

  it("scope 只接受三选一", () => {
    expect(() => listQuerySchema.parse({ scope: "xxx" })).toThrow();
    expect(listQuerySchema.parse({ scope: "private" }).scope).toBe("private");
  });

  it("limit 上限 500", () => {
    expect(() => listQuerySchema.parse({ limit: "501" })).toThrow();
  });
});

describe("settingsUpdateSchema", () => {
  const base = {
    provider: "openai" as const,
    model: "gpt-4o",
    apiKey: "sk-xxxxx",
    baseUrl: undefined,
  };

  it("完整入参通过", () => {
    const out = settingsUpdateSchema.parse(base);
    expect(out.provider).toBe("openai");
    expect(out.baseUrl).toBeNull();
  });

  it("apiKey 空字符串拒", () => {
    expect(() => settingsUpdateSchema.parse({ ...base, apiKey: "" })).toThrow();
    expect(() => settingsUpdateSchema.parse({ ...base, apiKey: "   " })).toThrow();
  });

  it("provider 只接受三选一", () => {
    expect(() =>
      settingsUpdateSchema.parse({ ...base, provider: "gemini" }),
    ).toThrow();
  });

  it("baseUrl 非法 URL 拒", () => {
    expect(() =>
      settingsUpdateSchema.parse({ ...base, baseUrl: "not-a-url" }),
    ).toThrow();
  });

  it("baseUrl 空字符串归 null", () => {
    const out = settingsUpdateSchema.parse({ ...base, baseUrl: "" });
    expect(out.baseUrl).toBeNull();
  });

  it("baseUrl 合法 URL 通过", () => {
    const out = settingsUpdateSchema.parse({
      ...base,
      baseUrl: "https://api.deepseek.com/v1",
    });
    expect(out.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("model 超 64 字符拒", () => {
    expect(() =>
      settingsUpdateSchema.parse({ ...base, model: "x".repeat(65) }),
    ).toThrow();
  });
});
