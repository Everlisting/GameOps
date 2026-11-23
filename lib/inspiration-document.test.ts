import { describe, expect, it } from "vitest";
import { getInspirationDocument } from "./inspiration-document";

describe("getInspirationDocument", () => {
  it("识别腾讯文档并保留定位参数", () => {
    const url = "https://docs.qq.com/doc/Example-id?tab=read#section";
    expect(getInspirationDocument(url)).toEqual({ kind: "tencent-doc", url });
  });

  it("识别飞书租户的文档、知识库和 Lark 链接", () => {
    for (const url of [
      "https://team.feishu.cn/docx/Example",
      "https://team.feishu.cn/wiki/Example?from=from_copylink",
      "https://team.larksuite.com/wiki/Example",
    ]) {
      expect(getInspirationDocument(url)).toEqual({ kind: "feishu-doc", url });
    }
  });

  it("仅预览素材库中上传的 PDF 文件", () => {
    const url = "/uploads/inspirations/doc/Example.pdf";
    expect(getInspirationDocument(url)).toEqual({ kind: "pdf", url });
    expect(getInspirationDocument("/uploads/inspirations/doc/Example.zip")).toBeNull();
    expect(getInspirationDocument("https://example.com/Example.pdf")).toBeNull();
  });

  it.each([
    "https://docs.qq.com.example.com/doc/Example",
    "https://team.feishu.cn.example.com/wiki/Example",
    "https://docs.qq.com@evil.example/doc/Example",
    "https://user:password@docs.qq.com/doc/Example",
    "https://docs.qq.com:8080/doc/Example",
    "https://docs.qq.com/login",
    "https://docs.qq.com/doc/Example/redirect",
    "http://docs.qq.com/doc/Example",
    "javascript:alert(1)",
  ])("不将未经支持的链接作为文档预览 %s", (url) => {
    expect(getInspirationDocument(url)).toBeNull();
  });
});
