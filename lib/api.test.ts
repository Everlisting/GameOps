import { describe, it, expect } from "vitest";

import { route } from "./api";
import { badRequest } from "./errors";

const okHandler = route(async () => Response.json({ ok: true }));

describe("route() requestId 与响应", () => {
  it("合法 x-request-id 原样回显", async () => {
    const res = await okHandler(
      new Request("http://x/api/foo", { headers: { "x-request-id": "abc-123_XYZ" } }),
      {},
    );
    expect(res.headers.get("x-request-id")).toBe("abc-123_XYZ");
    expect(res.status).toBe(200);
  });

  it("非法 x-request-id 被重新生成", async () => {
    const res = await okHandler(
      new Request("http://x/api/foo", { headers: { "x-request-id": "bad id with spaces!" } }),
      {},
    );
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    expect(id).not.toBe("bad id with spaces!");
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("缺失时生成 requestId", async () => {
    const res = await okHandler(new Request("http://x/api/foo"), {});
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("抛 AppError 仍转为对应响应并带 requestId", async () => {
    const bad = route(async () => {
      throw badRequest("参数错误");
    });
    const res = await bad(new Request("http://x/api/bar"), {});
    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
