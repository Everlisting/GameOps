import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  save: vi.fn(),
  batch: vi.fn(),
  load: vi.fn(),
  next: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/video-reviews", () => ({
  saveVideoReview: mocks.save,
  batchVideoReview: mocks.batch,
  loadVideoReviews: mocks.load,
  nextVideoReview: mocks.next,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
import { PATCH } from "./[id]/route";
import { POST } from "./batch/route";
import { GET } from "./route";
import { GET as NEXT } from "./next/route";
import { revalidateTag } from "next/cache";
const request = (body: unknown) =>
  new Request("http://localhost/api/operator/video-reviews/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    sub: "r1",
    username: "reviewer",
    role: "REVIEWER",
  });
  mocks.save.mockResolvedValue({ id: "v1" });
  mocks.batch.mockResolvedValue({ count: 1 });
  mocks.load.mockResolvedValue({ rows: [] });
  mocks.next.mockResolvedValue({ id: "next" });
});
describe("视频审核接口边界", () => {
  it("下一条接口由审核角色使用，忽略伪造状态/分页并传递稳定游标", async () => {
    const response = await NEXT(
      new Request(
        "http://localhost/api/operator/video-reviews/next?status=APPROVED&page=9&afterId=current&platform=douyin",
      ),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ video: { id: "next" } });
    expect(mocks.next).toHaveBeenCalledWith({ platform: "douyin" }, "current", expect.objectContaining({ sub: "r1", role: "REVIEWER" }));
  });
  it("审核员可审核，操作者取自会话，忽略伪造审核员", async () => {
    const response = await PATCH(
      request({ status: "APPROVED", tagIds: ["leaf"], reviewerId: "spoof" }),
      { params: { id: "v1" } },
    );
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      "v1",
      { status: "APPROVED", tagIds: ["leaf"] },
      expect.objectContaining({ sub: "r1" }),
    );
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("special-activity-estimates");
  });
  it("创作者不能读取视频审核或调用单条/批量审核", async () => {
    mocks.session.mockResolvedValue({
      sub: "c1",
      username: "creator",
      role: "CREATOR",
    });
    expect(
      (
        await GET(
          new Request("http://localhost/api/operator/video-reviews"),
          {},
        )
      ).status,
    ).toBe(403);
    expect(
      (await PATCH(request({ status: "APPROVED" }), { params: { id: "v1" } }))
        .status,
    ).toBe(403);
    expect(
      (await POST(request({ ids: ["v1"], status: "APPROVED" }), {})).status,
    ).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(
      (
        await NEXT(
          new Request("http://localhost/api/operator/video-reviews/next"),
          {},
        )
      ).status,
    ).toBe(403);
    expect(mocks.next).not.toHaveBeenCalled();
  });
  it("拒绝无审核结果，原批量接口停用且不再写入", async () => {
    expect((await PATCH(request({}), { params: { id: "v1" } })).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          request({ ids: Array(201).fill("v1"), status: "APPROVED" }),
          {},
        )
      ).status,
    ).toBe(404);
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("单条保存拒绝待审核、未选标签和空标签，且不执行保存或审计", async () => {
    for (const body of [
      { status: "PENDING", tagIds: ["leaf"] },
      { status: "APPROVED" },
      { status: "APPROVED", tagIds: [] },
    ]) {
      expect((await PATCH(request(body), { params: { id: "v1" } })).status).toBe(400);
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
