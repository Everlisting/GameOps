import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";

import { AppError } from "@/lib/errors";
import {
  encryptSecret,
  decryptSecret,
  maskApiKey,
  _resetKeyCacheForTest,
} from "./crypto";

// 每个 case 之前塞入一个合法密钥;测试内部会覆盖再清缓存
function setKey(): void {
  process.env.OPINION_AES_KEY = randomBytes(32).toString("base64");
  _resetKeyCacheForTest();
}

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => setKey());

  it("往返可复原原始明文", () => {
    const plain = "sk-abcdef1234567890";
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("同一明文两次加密产出不同密文(IV 随机)", () => {
    const a = encryptSecret("hello");
    const b = encryptSecret("hello");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("hello");
    expect(decryptSecret(b)).toBe("hello");
  });

  it("空串也能加解密", () => {
    const enc = encryptSecret("");
    expect(decryptSecret(enc)).toBe("");
  });

  it("中文/emoji 保持 utf-8 语义", () => {
    const plain = "你好世界 🎮";
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("密文被改一位 → GCM 校验失败抛 AppError", () => {
    const enc = encryptSecret("secret");
    const bad = Buffer.from(enc, "base64");
    bad[bad.length - 1] ^= 0x01;
    const tampered = bad.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow(AppError);
  });

  it("换一把密钥后无法解出原密文", () => {
    const enc = encryptSecret("first-secret");
    setKey(); // 新密钥
    expect(() => decryptSecret(enc)).toThrow(AppError);
  });

  it("密文长度不足直接拒", () => {
    expect(() => decryptSecret("YWJj")).toThrow(AppError); // "abc"
  });

  it("解密空串抛 BAD_REQUEST", () => {
    expect(() => decryptSecret("")).toThrow(AppError);
  });
});

describe("loadKey 边界", () => {
  it("缺 env 抛 INTERNAL", () => {
    delete process.env.OPINION_AES_KEY;
    _resetKeyCacheForTest();
    expect(() => encryptSecret("x")).toThrow(AppError);
  });

  it("长度不对抛 INTERNAL", () => {
    process.env.OPINION_AES_KEY = Buffer.from("short").toString("base64");
    _resetKeyCacheForTest();
    expect(() => encryptSecret("x")).toThrow(AppError);
  });
});

describe("maskApiKey", () => {
  it("典型 openai key 打码前 3 后 4", () => {
    expect(maskApiKey("sk-1234567890abcdef")).toBe("sk-****cdef");
  });

  it("短串统一 ****", () => {
    expect(maskApiKey("abc")).toBe("****");
    expect(maskApiKey("abcdefg")).toBe("****");
  });

  it("空串返回空串", () => {
    expect(maskApiKey("")).toBe("");
  });

  it("首尾空格 trim", () => {
    expect(maskApiKey("  sk-abcdefghijk  ")).toBe("sk-****hijk");
  });
});
