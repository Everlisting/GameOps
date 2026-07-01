import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  assertSafeTaskId,
  ensureTaskDir,
  htmlPath,
  isDownloaded,
  metaPath,
  removeTaskDir,
  taskDir,
} from "./storage";

describe("assertSafeTaskId", () => {
  it.each([
    "opn_abc123",
    "abc-123.def",
    "opn_" + "a".repeat(76),
  ])("接受合法 id: %s", (id) => {
    expect(() => assertSafeTaskId(id)).not.toThrow();
  });

  it.each([
    "",
    "../etc/passwd",
    "opn abc",   // 空格
    "opn/abc",   // 路径分隔
    "opn\\abc",
    "opn?abc",
    "opn_" + "a".repeat(200),
  ])("拒绝非法 id: %s", (id) => {
    expect(() => assertSafeTaskId(id)).toThrow();
  });
});

describe("taskDir / htmlPath", () => {
  it("返回 storage/opinion-reports 下的路径", () => {
    const d = taskDir("opn_abc");
    expect(d).toContain(path.join("storage", "opinion-reports", "opn_abc"));
  });

  it("htmlPath 结尾 index.html", () => {
    expect(htmlPath("opn_abc").endsWith(path.join("opn_abc", "index.html"))).toBe(true);
  });
});

describe("isDownloaded / ensureTaskDir / removeTaskDir", () => {
  it("生命周期:创建 → 写文件 → 判 downloaded → 删", () => {
    const id = `opn_test_${Date.now()}`;
    ensureTaskDir(id);
    expect(fs.existsSync(taskDir(id))).toBe(true);
    // 空目录 != downloaded
    expect(isDownloaded(id)).toBe(false);

    fs.writeFileSync(htmlPath(id), "<html></html>");
    fs.writeFileSync(metaPath(id), "{}");
    expect(isDownloaded(id)).toBe(true);

    removeTaskDir(id);
    expect(fs.existsSync(taskDir(id))).toBe(false);
    expect(isDownloaded(id)).toBe(false);
  });

  it("重复 remove 静默", () => {
    expect(() => removeTaskDir(`opn_notexist_${Date.now()}`)).not.toThrow();
  });
});
