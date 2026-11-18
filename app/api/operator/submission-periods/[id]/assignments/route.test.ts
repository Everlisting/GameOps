import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), assign: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/review-assignments", () => ({ assignPeriodReviews: mocks.assign }));
import { POST } from "./route";
const input = { requestId: "b0e3bb76-90bb-4afb-8b9a-4a5540045874", expectedEligibleCount: 2, mode: "EVEN", recipients: [{ reviewerId: "r1" }] };
const request = (body: unknown) => new Request("http://localhost/api/operator/submission-periods/p/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ sub: "op", username: "operator", role: "OPERATOR" }); mocks.assign.mockResolvedValue({ assigned: 2 }); });
describe("稿件分配接口", () => {
  it("只使用服务端会话身份，新建请求参数通过校验后执行", async () => {
    expect((await POST(request({ ...input, actorId: "spoof" }), { params: { id: "period" } })).status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledWith("period", input, expect.objectContaining({ sub: "op" }));
  });
  it("审核员及创作者不能分配", async () => {
    for (const role of ["REVIEWER", "CREATOR"]) {
      mocks.session.mockResolvedValue({ sub: "viewer", username: "viewer", role });
      expect((await POST(request(input), { params: { id: "period" } })).status).toBe(403);
    }
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("拒绝重复审核员、缺少请求标识和指定量为0", async () => {
    for (const body of [{ ...input, requestId: "" }, { ...input, recipients: [{ reviewerId: "r1" }, { reviewerId: "r1" }] }, { ...input, mode: "QUOTA", recipients: [{ reviewerId: "r1", count: 0 }] }]) {
      expect((await POST(request(body), { params: { id: "period" } })).status).toBe(400);
    }
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("组合请求保留平均总量，坏组合不执行服务", async () => {
    const plan = { requestId: input.requestId, expectedEligibleCount: 10, groups: [
      { mode: "EVEN", totalCount: 5, recipients: [{ reviewerId: "r1" }, { reviewerId: "r2" }] },
      { mode: "QUOTA", recipients: [{ reviewerId: "r1", count: 2 }] },
    ] };
    expect((await POST(request(plan), { params: { id: "period" } })).status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledWith("period", plan, expect.objectContaining({ sub: "op" }));
    mocks.assign.mockClear();
    expect((await POST(request({ ...plan, expectedEligibleCount: 6 }), { params: { id: "period" } })).status).toBe(400);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
