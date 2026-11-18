import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/video-review-history", () => ({ loadVideoReviewHistory: mocks.load }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ sub: "op", role: "OPERATOR", username: "operator" }); mocks.load.mockResolvedValue({ rows: [], total: 0, page: 1, totalPages: 1 }); });
describe("运营审核日志接口", () => {
  it("运营读取指定稿件并禁止缓存", async () => {
    const response = await GET(new Request("http://localhost/api/operator/video-reviews/v1/logs?page=2"), { params: { id: "v1" } });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.load).toHaveBeenCalledWith("v1", 2, expect.objectContaining({ sub: "op" }));
  });
  it("未登录401、审核员和创作者403，不查询日志", async () => {
    for (const [session, status] of [[null, 401], [{ role: "REVIEWER" }, 403], [{ role: "CREATOR" }, 403]] as const) {
      mocks.session.mockResolvedValue(session);
      expect((await GET(new Request("http://localhost/logs"), { params: { id: "v1" } })).status).toBe(status);
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("非法页码被拒绝", async () => {
    expect((await GET(new Request("http://localhost/logs?page=-1"), { params: { id: "v1" } })).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
