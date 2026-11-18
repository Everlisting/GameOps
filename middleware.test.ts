import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

vi.mock("@/lib/session", () => ({
  COOKIE_NAME: "session",
  verifySession: async () => ({ role: "OPERATOR" }),
}));

function request(path: string, headers: Record<string, string> = {}) {
  return middleware(new NextRequest(new URL(path, "http://localhost"), {
    headers: { accept: "text/html", cookie: "session=test", ...headers },
  }));
}

describe("列表入口", () => {
  const path = "/operator/submissions/review";

  it("整页刷新先清理筛选，仅保留业务参数，规范后的地址直接放行", async () => {
    const response = await request(path + "?q=a&q=b&page=2&videoId=123");
    const target = response.headers.get("location");
    expect(target).toBe("http://localhost" + path + "?videoId=123");
    expect((await request(target!)).headers.get("location")).toBeNull();
  });

  it("周期链接与站内筛选直接按目标条件读取", async () => {
    const filtered = path + "?from=2026-07-01&status=PENDING";
    expect((await request(filtered + "&keepFilters=1")).headers.get("location")).toBeNull();
    expect((await request(filtered, { accept: "*/*", rsc: "1" })).headers.get("location")).toBeNull();
  });

  it("未登录时先分流，保留登录回跳路径", async () => {
    expect((await request(path + "?status=PENDING", { cookie: "" })).headers.get("location"))
      .toBe("http://localhost/login?from=%2Foperator%2Fsubmissions%2Freview");
  });
});
