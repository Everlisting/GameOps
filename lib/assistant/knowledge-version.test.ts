import { describe, expect, it } from "vitest";

import { knowledgeContentChecksum } from "@/lib/assistant/knowledge-version";
import { chunkText } from "@/lib/assistant/rag";

describe("knowledgeContentChecksum", () => {
  it("同一正文得到稳定摘要，正文变化会改变摘要", () => {
    const first = knowledgeContentChecksum("运营规则 v1");
    expect(first).toHaveLength(64);
    expect(knowledgeContentChecksum("运营规则 v1")).toBe(first);
    expect(knowledgeContentChecksum("运营规则 v2")).not.toBe(first);
  });
});

describe("chunkText", () => {
  it("按段落打包且不返回空块", () => {
    expect(chunkText("第一段\n\n第二段", 20, 3)).toEqual(["第一段\n\n第二段"]);
    expect(chunkText("  \n\n  ")).toEqual([]);
  });

  it("超长段落使用重叠窗口", () => {
    const chunks = chunkText("1234567890", 6, 2);
    expect(chunks).toEqual(["123456", "567890", "90"]);
  });
});
