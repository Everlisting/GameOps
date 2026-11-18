import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/submission-periods", () => ({ saveSubmissionPeriod: mocks.save }));
import { POST } from "./route";
import { PATCH } from "./[id]/route";
const input = { title: "七月稿件", startDate: "2026-07-01", endDate: "2026-07-31", status: "REVIEWING" };
const request = (body: unknown) => new Request("http://localhost/api/operator/submission-periods", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ sub: "operator", role: "OPERATOR", username: "operator" });
  mocks.save.mockResolvedValue({ id: "period" });
});
describe("稿件统计配置权限", () => {
  it("运营可新建和编辑，身份从会话取得", async () => {
    expect((await POST(request({ ...input, actorId: "spoof" }), {})).status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith(input, expect.objectContaining({ sub: "operator" }));
    expect((await PATCH(request(input), { params: { id: "period" } })).status).toBe(200);
    expect(mocks.save).toHaveBeenLastCalledWith(input, expect.objectContaining({ sub: "operator" }), "period");
  });
  it("审核员和创作者不能修改统计配置", async () => {
    for (const role of ["REVIEWER", "CREATOR"]) {
      mocks.session.mockResolvedValue({ sub: "viewer", username: "viewer", role });
      expect((await POST(request(input), {})).status).toBe(403);
      expect((await PATCH(request(input), { params: { id: "period" } })).status).toBe(403);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("无效周期不落库", async () => {
    expect((await POST(request({ ...input, endDate: "2026-06-30" }), {})).status).toBe(400);
    expect((await POST(request({ ...input, title: "" }), {})).status).toBe(400);
    expect((await POST(request({ ...input, status: "invalid" }), {})).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
