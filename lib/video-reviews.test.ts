import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  tags: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
  auditCreate: vi.fn(),
  auditCount: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    videoStat: {
      count: mocks.count,
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
    },
    $transaction: mocks.transaction,
    $queryRaw: mocks.query,
  },
}));
import {
  loadVideoReviews,
  saveVideoReview,
  nextVideoReview,
} from "./video-reviews";
const actor = {
  sub: "r1",
  username: "reviewer-account",
  displayName: "审核员甲",
  role: "OPERATOR" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(53496);
  mocks.findMany.mockResolvedValue([
    {
      id: "v1",
      platform: "douyin",
      creatorUid: "uid",
      externalId: "123",
      title: "视频",
      publishedAt: new Date("2026-11-13T00:00:00Z"),
      reviewedAt: null,
      reviewStatus: "PENDING",
      reviewerName: null,
      reviewTags: [],
    },
  ]);
  mocks.findUnique.mockResolvedValue({ id: "v1", reviewTags: [] });
  mocks.findFirst.mockResolvedValue(null);
  mocks.tags.mockResolvedValue([]);
  mocks.update.mockResolvedValue({ id: "v1" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.query.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
  mocks.auditCount.mockResolvedValue(0);
  mocks.transaction.mockImplementation(
    async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: mocks.lock,
        $queryRaw: mocks.query,
        videoStat: {
          findUnique: mocks.findUnique,
          findMany: mocks.findMany,
          update: mocks.update,
          updateMany: mocks.updateMany,
        },
        reviewTag: { findMany: mocks.tags },
        auditLog: { create: mocks.auditCreate, count: mocks.auditCount },
      }),
  );
});
describe("视频库审核口径", () => {
  it("审核员列表只加载本人分配ID，不能通过videoId或查询条件扩大范围", async () => {
    const reviewer = { ...actor, role: "REVIEWER" as const };
    mocks.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ id: "mine" }]);
    await loadVideoReviews({ status: "ALL", videoId: "foreign", visibility: "all" }, reviewer);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["mine"] } });
    for (const call of mocks.query.mock.calls) expect(call[0].values).toContain("r1");
    expect(mocks.count).not.toHaveBeenCalled();
  });
  it("审核员的连续队列和游标均校验分配关系", async () => {
    const reviewer = { ...actor, role: "REVIEWER" as const };
    await expect(nextVideoReview({}, "foreign", reviewer)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    mocks.query.mockResolvedValueOnce([{ id: "mine" }]);
    mocks.findUnique.mockResolvedValueOnce({ id: "mine", publishedAt: null, reviewedAt: null });
    expect(await nextVideoReview({}, undefined, reviewer)).toMatchObject({ id: "mine" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("未分配稿件在写入前拒绝", async () => {
    const reviewer = { ...actor, role: "REVIEWER" as const };
    await expect(saveVideoReview("foreign", { status: "APPROVED", tagIds: ["leaf"] }, reviewer)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("开始审核忽略当前列表页码和状态，沿用内容筛选找最早待审视频", async () => {
    await nextVideoReview({
      q: "作品",
      status: "REJECTED",
      platform: "douyin",
      visibility: "hidden",
      page: "8",
      videoId: "old",
    }, undefined, actor);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hidden: true,
          platform: "douyin",
          reviewStatus: "PENDING",
        }),
        orderBy: [
          { publishedAt: { sort: "asc", nulls: "last" } },
          { id: "asc" },
        ],
      }),
    );
    expect(mocks.findFirst.mock.calls[0][0].where).not.toHaveProperty("id");
    expect(mocks.findFirst.mock.calls[0][0]).not.toHaveProperty("skip");
  });
  it("连续审核使用日期和ID游标，包含同时间后续视频及未知日期，不因待审数量变化跳条", async () => {
    const date = new Date("2026-11-13T00:00:00Z");
    mocks.findUnique.mockResolvedValue({ id: "middle", publishedAt: date });
    await nextVideoReview({}, "middle", actor);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { hidden: false, reviewStatus: "PENDING" },
            {
              OR: [
                { publishedAt: { gt: date } },
                { publishedAt: date, id: { gt: "middle" } },
                { publishedAt: null },
              ],
            },
          ],
        },
      }),
    );
  });
  it("未知日期的后续只取未知日期且ID更大的视频，队列末尾返回null", async () => {
    mocks.findUnique.mockResolvedValue({ id: "z", publishedAt: null });
    expect(await nextVideoReview({}, "z", actor)).toBeNull();
    expect(mocks.findFirst.mock.calls[0][0].where.AND[1]).toEqual({
      publishedAt: null,
      id: { gt: "z" },
    });
  });
  it("下一条序列化日期，已删除的游标明确报错", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "next",
      publishedAt: new Date("2026-11-13T00:00:00Z"),
      reviewedAt: null,
    });
    expect(await nextVideoReview({}, undefined, actor)).toMatchObject({
      id: "next",
      publishedAt: "2026-11-13T00:00:00.000Z",
      reviewedAt: null,
    });
    mocks.findUnique.mockResolvedValue(null);
    await expect(nextVideoReview({}, "deleted", actor)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("运营直接查询视频库，默认有效且全部状态，审核时间降序且空值最后，日期仍筛发布时间", async () => {
    const result = await loadVideoReviews({
      q: "123",
      from: "2026-11-13",
      page: "999999",
    }, actor);
    expect(result.total).toBe(53496);
    expect(result.page).toBe(result.totalPages);
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      hidden: false,
      publishedAt: { gte: new Date("2026-11-12T16:00:00Z") },
    });
    expect(query.where).not.toHaveProperty("activityId");
    expect(query.where).not.toHaveProperty("reviewStatus");
    expect(query.select).not.toHaveProperty("creatorUid");
    expect(query.orderBy).toEqual([
      { reviewedAt: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ]);
    expect(query.select).not.toHaveProperty("creator");
    expect(query.select).not.toHaveProperty("creatorName");
    expect(query.where.OR).toContainEqual({
      creatorUid: { contains: "123", mode: "insensitive" },
    });
  });
  it("支持全部视频和全部审核结果，不强制限本月或征稿活动", async () => {
    await loadVideoReviews({ status: "ALL", visibility: "all" }, actor);
    expect(mocks.count).toHaveBeenCalledWith({ where: {} });
  });
  it("管理员与运营使用相同默认规则，显式选择待审核时保留筛选", async () => {
    await loadVideoReviews({}, { ...actor, role: "ADMIN" });
    expect(mocks.count).toHaveBeenCalledWith({ where: { hidden: false } });
    expect(mocks.findMany.mock.calls[0][0].orderBy).toEqual([{ reviewedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    await loadVideoReviews({ status: "PENDING" }, actor);
    expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({ reviewStatus: "PENDING" });
  });
  it("审核员仍默认待审核、按发布时间升序且只读本人分配", async () => {
    mocks.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ id: "mine" }]);
    await loadVideoReviews({}, { ...actor, role: "REVIEWER" });
    expect(mocks.query.mock.calls[0][0].values).toContain("PENDING");
    expect(mocks.query.mock.calls[0][0].values).toContain("r1");
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["mine"] } }, orderBy: [{ publishedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }] });
  });
  it("保存真实操作人及显示名快照，必填末级标签一起保存", async () => {
    mocks.tags.mockResolvedValue([
      { id: "leaf", parentId: null, name: "leaf", description: "", enabled: true, sortOrder: 0 },
    ]);
    await saveVideoReview(
      "v1",
      { status: "APPROVED", tagIds: ["leaf"], note: null },
      actor,
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: "APPROVED",
          reviewerId: "r1",
          reviewerName: "审核员甲",
          reviewedAt: expect.any(Date),
          reviewTags: { set: [{ id: "leaf" }] },
        }),
      }),
    );
  });
  it("事务内拒绝未选满的分支和空标签，不写入审核结果", async () => {
    mocks.tags.mockResolvedValue([
      { id: "root", parentId: null, name: "root", description: "", enabled: true, sortOrder: 0 },
      { id: "child", parentId: "root", name: "child", description: "", enabled: true, sortOrder: 0 },
    ]);
    await expect(saveVideoReview("v1", { status: "APPROVED", tagIds: ["root"] }, actor)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(saveVideoReview("v1", { status: "REJECTED", tagIds: [] }, actor)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.lock).toHaveBeenCalled();
    await expect(saveVideoReview("v1", { status: "REJECTED", tagIds: ["child"] }, actor)).resolves.toEqual({ id: "v1" });
  });
  it("祖先停用不能新增标签，但已关联的历史标签可保留", async () => {
    mocks.tags.mockResolvedValue([
      {
        id: "a",
        parentId: null,
        name: "a",
        description: "",
        enabled: false,
        sortOrder: 0,
      },
      {
        id: "b",
        parentId: "a",
        name: "b",
        description: "",
        enabled: true,
        sortOrder: 0,
      },
    ]);
    await expect(
      saveVideoReview("v1", { status: "APPROVED", tagIds: ["b"] }, actor),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.findUnique.mockResolvedValue({ id: "v1", reviewTags: [{ id: "b" }] });
    await expect(
      saveVideoReview("v1", { status: "APPROVED", tagIds: ["b"] }, actor),
    ).resolves.toEqual({ id: "v1" });
  });
  it("审核结果与审核人、完整标签路径快照在同一事务保存", async () => {
    mocks.tags.mockResolvedValue([
      { id: "root", parentId: null, name: "合格", description: "", enabled: true, sortOrder: 0 },
      { id: "leaf", parentId: "root", name: "真人实拍", description: "", enabled: true, sortOrder: 0 },
    ]);
    await saveVideoReview("v1", { status: "APPROVED", tagIds: ["leaf"] }, actor);
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: "r1", actorUsername: "reviewer-account", targetId: "v1", action: "video.review",
      details: expect.objectContaining({ reviewerName: "审核员甲", status: "APPROVED", tags: [{ id: "leaf", name: "真人实拍", path: "合格 / 真人实拍" }] }),
    }) });
    expect(mocks.auditCreate.mock.calls[0][0].data.createdAt).toEqual(mocks.update.mock.calls[0][0].data.reviewedAt);
  });
  it("无审计的早期结果首次覆盖前保存旧状态，已有日志时不重复补记录", async () => {
    mocks.tags.mockResolvedValue([{ id: "leaf", parentId: null, name: "合格", description: "", enabled: true, sortOrder: 0 }]);
    const reviewedAt = new Date("2026-07-01T00:00:00Z");
    mocks.findUnique.mockResolvedValue({ id: "v1", reviewStatus: "REJECTED", reviewedAt, reviewerName: "旧审核员", reviewNote: "旧备注", reviewTags: [{ id: "leaf" }] });
    await saveVideoReview("v1", { status: "APPROVED", tagIds: ["leaf"] }, actor);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(2);
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({ createdAt: reviewedAt, details: { recordSource: "current", reviewerName: "旧审核员", status: "REJECTED" } });
    mocks.auditCount.mockResolvedValue(1);
    await saveVideoReview("v1", { status: "APPROVED", tagIds: ["leaf"] }, actor);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(3);
  });
  it("日志写入失败时向事务抛出错误，不报告审核成功", async () => {
    mocks.tags.mockResolvedValue([{ id: "leaf", parentId: null, name: "合格", description: "", enabled: true, sortOrder: 0 }]);
    mocks.auditCreate.mockRejectedValue(new Error("audit unavailable"));
    await expect(saveVideoReview("v1", { status: "APPROVED", tagIds: ["leaf"] }, actor)).rejects.toThrow("audit unavailable");
  });
});
