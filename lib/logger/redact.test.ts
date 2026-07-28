import { describe, it, expect } from "vitest";

import { isSensitiveKey, scrubString, scrubValue, clampString, REDACTED } from "./redact";
import { LIMITS } from "./schema";

describe("isSensitiveKey", () => {
  it("命中常见敏感键(忽略大小写/连字符/下划线)", () => {
    for (const k of [
      "Authorization",
      "x-llm-api-key",
      "apiKey",
      "API_KEY",
      "password",
      "Cookie",
      "Set-Cookie",
      "appSecret",
      "Verification-Token",
      "EncryptKey",
      "aesKey",
      "refreshToken",
      "fooEnc",
    ]) {
      expect(isSensitiveKey(k)).toBe(true);
    }
  });
  it("放过普通业务键", () => {
    for (const k of ["taskId", "note", "status", "publicUrl", "count", "durationMs"]) {
      expect(isSensitiveKey(k)).toBe(false);
    }
  });
});

describe("scrubString 值模式兜底", () => {
  it("手机号", () => {
    expect(scrubString("联系 13812345678 谢谢")).toBe("联系 [phone] 谢谢");
  });
  it("邮箱", () => {
    expect(scrubString("a.b+x@example.com")).toBe("[email]");
  });
  it("JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123456";
    expect(scrubString(`token=${jwt}`)).toBe("token=[jwt]");
  });
  it("Bearer", () => {
    expect(scrubString("Authorization: Bearer abcdef123456xyz")).toContain("Bearer [redacted]");
  });
  it("飞书 webhook", () => {
    const url = "https://open.feishu.cn/open-apis/bot/v2/hook/abc-123_XYZ";
    expect(scrubString(`发到 ${url}`)).toBe("发到 [feishu-webhook]");
  });
});

describe("scrubValue 递归脱敏 + 限制", () => {
  it("嵌套敏感键 → [redacted],普通键保留", () => {
    const out = scrubValue({ data: { apiKey: "x", token: "y", note: "ok" } }) as Record<
      string,
      Record<string, unknown>
    >;
    expect(out.data.apiKey).toBe(REDACTED);
    expect(out.data.token).toBe(REDACTED);
    expect(out.data.note).toBe("ok");
  });
  it("数组超 20 项 → 截断并标注", () => {
    const out = scrubValue(Array.from({ length: 25 }, (_, i) => i)) as unknown[];
    expect(out).toHaveLength(21);
    expect(out[20]).toBe("[+5 more]");
  });
  it("超深 → [depth-limited]", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 8; i++) deep = { n: deep };
    const s = JSON.stringify(scrubValue(deep));
    expect(s).toContain("[depth-limited]");
    expect(s).not.toContain("leaf");
  });
  it("循环引用不炸", () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    const out = scrubValue(a) as Record<string, unknown>;
    expect(out.self).toBe("[circular]");
  });
  it("字符串值也过值模式 + 限长", () => {
    const out = scrubValue({ msg: "打给 13812345678" }) as Record<string, string>;
    expect(out.msg).toBe("打给 [phone]");
  });
  it("Date → ISO,函数/undefined 丢弃", () => {
    const out = scrubValue({ at: new Date("2026-01-02T03:04:05Z"), fn: () => 1, u: undefined }) as Record<
      string,
      unknown
    >;
    expect(out.at).toBe("2026-01-02T03:04:05.000Z");
    expect("fn" in out).toBe(false);
    expect("u" in out).toBe(false);
  });
});

describe("clampString", () => {
  it("超限截断并标记", () => {
    const { value, truncated } = clampString("x".repeat(LIMITS.string + 10), LIMITS.string);
    expect(truncated).toBe(true);
    expect(value.endsWith("…")).toBe(true);
    expect(value.length).toBe(LIMITS.string + 1);
  });
});
