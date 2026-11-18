import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ video: vi.fn(), count: vi.fn(), logs: vi.fn(), tags: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { videoStat: { findUnique: mocks.video }, auditLog: { count: mocks.count, findMany: mocks.logs }, reviewTag: { findMany: mocks.tags } } }));
import { loadVideoReviewHistory } from "./video-review-history";
const actor = { sub: "op", role: "OPERATOR" as const };
const log = { id: "a1", actorUsername: "account", action: "video.review", createdAt: new Date("2026-07-01T00:00:00Z"), details: { status: "APPROVED", reviewerName: "旧显示名", tags: [{ id: "leaf", path: "旧父级 / 旧标签" }] } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.video.mockResolvedValue({ reviewStatus: "PENDING", reviewedAt: null, reviewTags: [] });
  mocks.count.mockResolvedValue(1); mocks.logs.mockResolvedValue([log]);
  mocks.tags.mockResolvedValue([{ id: "leaf", name: "新标签", parentId: null, sortOrder: 0, enabled: true, description: "" }]);
});
describe("稿件审核记录", () => {
  it("只允许运营与管理员，即使直接调用服务也拒绝审核员", async () => {
    await expect(loadVideoReviewHistory("v1", 1, { sub: "r", role: "REVIEWER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.video).not.toHaveBeenCalled();
    await expect(loadVideoReviewHistory("v1", 1, { sub: "a", role: "ADMIN" })).resolves.toMatchObject({ total: 1 });
  });
  it("标签和显示名优先取审核时快照，重命名或删除标签不会改写历史", async () => {
    const result = await loadVideoReviewHistory("v1", 1, actor);
    expect(result.rows[0]).toMatchObject({ reviewerName: "旧显示名", actorUsername: "account", tags: [{ id: "leaf", path: "旧父级 / 旧标签" }], tagSource: "snapshot" });
    expect(mocks.tags).not.toHaveBeenCalled();
  });
  it("旧单条按现存标签解释并标注，旧批量缺失标签时不冒用视频当前标签", async () => {
    mocks.logs.mockResolvedValue([{ ...log, details: { status: "REJECTED", tagIds: ["leaf", "deleted"] } }, { ...log, id: "a2", action: "video.review.batch", details: { ids: ["v1"], status: "APPROVED" } }]);
    const result = await loadVideoReviewHistory("v1", 1, actor);
    expect(result.rows[0]).toMatchObject({ tagSource: "current", tags: [{ id: "leaf", path: "新标签" }, { id: "deleted", path: "已删除标签（deleted）" }] });
    expect(result.rows[1]).toMatchObject({ source: "batch", tagSource: "missing", tags: [] });
    const where = mocks.count.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ action: "video.review", targetId: "v1" });
    expect(where.OR).toContainEqual({ action: "video.review.batch", details: { path: ["ids"], array_contains: ["v1"] } });
    expect(where).not.toHaveProperty("createdAt");
  });
  it("分页倒序查询且越界页收敛到最后一页，不一次加载全部日志", async () => {
    mocks.count.mockResolvedValue(41);
    expect(await loadVideoReviewHistory("v1", 999, actor)).toMatchObject({ total: 41, page: 3, totalPages: 3 });
    expect(mocks.logs).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 40, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  it("无日志时仅回显当前可恢复审核结果；未审视频显示空列表；不存在返回404", async () => {
    mocks.count.mockResolvedValue(0);
    expect(await loadVideoReviewHistory("v1", 1, actor)).toMatchObject({ total: 0, rows: [] });
    mocks.video.mockResolvedValue({ reviewStatus: "APPROVED", reviewedAt: new Date("2026-07-01T00:00:00Z"), reviewerName: null, reviewNote: null, reviewTags: [{ id: "leaf" }] });
    expect((await loadVideoReviewHistory("v1", 1, actor)).rows[0]).toMatchObject({ source: "current", reviewerName: "未记录审核人", tagSource: "current" });
    mocks.video.mockResolvedValue(null);
    await expect(loadVideoReviewHistory("missing", 1, actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
