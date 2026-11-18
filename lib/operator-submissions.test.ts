import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  groupBy: vi.fn(),
  submissions: vi.fn(),
  videos: vi.fn(),
  activities: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    submission: {
      count: mocks.count,
      groupBy: mocks.groupBy,
      findMany: mocks.submissions,
    },
    videoStat: { findMany: mocks.videos },
    activity: { findMany: mocks.activities },
  },
}));
import { loadSubmissions, submissionDate } from "./operator-submissions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(2);
  mocks.groupBy.mockResolvedValue([
    { status: "APPROVED", _count: { _all: 2 } },
  ]);
  mocks.activities.mockResolvedValue([]);
  mocks.submissions.mockResolvedValue([
    { id: "a", platform: "抖音", externalId: "v1", createdAt: new Date() },
    { id: "b", platform: "小红书", externalId: "v1", createdAt: new Date() },
  ]);
  mocks.videos.mockResolvedValue([
    { platform: "douyin", externalId: "v1", views: 0 },
  ]);
});
describe("稿件总览查询", () => {
  it("北京时间日期边界明确，并拒绝不存在的日期", () => {
    expect(submissionDate("2026-11-13")?.toISOString()).toBe(
      "2026-11-12T16:00:00.000Z",
    );
    expect(submissionDate("2026-11-13", true)?.toISOString()).toBe(
      "2026-11-13T15:59:59.999Z",
    );
    expect(submissionDate("2026-02-30")).toBeUndefined();
  });
  it("播放量按平台与 ID 匹配，0 与缺失数据保持区分", async () => {
    const result = await loadSubmissions({});
    expect(result.rows.map((row) => row.views)).toEqual([0, null]);
    expect(mocks.videos).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hidden: false }),
      }),
    );
    expect(mocks.submissions.mock.calls[0][0].select).not.toHaveProperty(
      "creator",
    );
  });
  it("审核队列默认待审，可显式查看全部结果；页码不会越界", async () => {
    const result = await loadSubmissions({ page: "100000" }, true);
    expect(result.page).toBe(1);
    expect(mocks.count).toHaveBeenLastCalledWith({
      where: { status: "PENDING" },
    });
    await loadSubmissions({ status: "ALL", platform: "douyin" }, true);
    expect(mocks.count).toHaveBeenLastCalledWith({
      where: { platform: { in: ["douyin", "抖音"] } },
    });
  });
});
