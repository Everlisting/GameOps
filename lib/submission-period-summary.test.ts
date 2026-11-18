import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query } }));
import { submissionPeriodSummary } from "./submission-period-summary";
import { submissionPeriodSchema } from "./validation/submission-period";
const actor = { sub: "o1", role: "OPERATOR" as const };
const row = { videoCount: 10, authorCount: 3, approvedCount: 4, rejectedCount: 2, approvedViews: 9000000000n, rejectedViews: 8n };
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([row]); });

describe("视频库稿件周期统计", () => {
  it("审核员统计绑定当前会话，不能汇总其他人的稿件", async () => {
    await submissionPeriodSummary("2026-07-01", "2026-07-31", { sub: "r1", role: "REVIEWER" });
    expect(mocks.query.mock.calls[0][0].values).toContain("r1");
    await expect(submissionPeriodSummary("2026-07-01", "2026-07-31", { sub: "c1", role: "CREATOR" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("按合格和不合格分别累计推荐播放量，进度包含两种已审核结果", async () => {
    const result = await submissionPeriodSummary("2026-07-01", "2026-07-31", actor);
    expect(result).toEqual({ ...row, approvedViews: 9000000000, rejectedViews: 8, reviewedCount: 6, pendingCount: 4, progress: 60 });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(mocks.query.mock.calls[0][0].values).toEqual([
      new Date("2026-06-30T16:00:00Z"), new Date("2026-07-31T16:00:00Z"),
    ]);
  });
  it("无视频时为0%，仅全部审核完成时为100%", async () => {
    mocks.query.mockResolvedValue([{ ...row, videoCount: 0, authorCount: 0, approvedCount: 0, rejectedCount: 0, approvedViews: 0n, rejectedViews: 0n }]);
    expect(await submissionPeriodSummary("2026-07-01", "2026-07-31", actor)).toMatchObject({ reviewedCount: 0, pendingCount: 0, progress: 0 });
    mocks.query.mockResolvedValue([{ ...row, videoCount: 6 }]);
    expect((await submissionPeriodSummary("2026-07-01", "2026-07-31", actor)).progress).toBe(100);
    mocks.query.mockResolvedValue([{ ...row, videoCount: 100000, approvedCount: 99999, rejectedCount: 0 }]);
    expect((await submissionPeriodSummary("2026-07-01", "2026-07-31", actor)).progress).toBe(99.99);
  });
  it("拒绝空名称、无效日期及倒置日期，同日周期允许", async () => {
    const input = { title: "  七月稿件  ", startDate: "2026-07-01", endDate: "2026-07-31" };
    expect(submissionPeriodSchema.parse(input).title).toBe("七月稿件");
    expect(submissionPeriodSchema.parse(input).status).toBe("REVIEWING");
    expect(submissionPeriodSchema.parse({ ...input, status: "FROZEN" }).status).toBe("FROZEN");
    expect(submissionPeriodSchema.parse({ ...input, startDate: " 2026-07-01 " }).startDate).toBe("2026-07-01");
    for (const patch of [{ title: " " }, { startDate: "2026-02-30" }, { endDate: "2026-06-30" }, { startDate: "" }]) {
      expect(submissionPeriodSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
    expect(submissionPeriodSchema.safeParse({ ...input, endDate: input.startDate }).success).toBe(true);
    await expect(submissionPeriodSummary("invalid", "2026-07-31", actor)).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
