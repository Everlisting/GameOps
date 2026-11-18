import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), auditFind: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
import { assignPeriodReviews } from "./review-assignments";
const actor = { sub: "operator", username: "operator", role: "OPERATOR" as const };
const input = { requestId: "b0e3bb76-90bb-4afb-8b9a-4a5540045874", expectedEligibleCount: 2, mode: "QUOTA" as const, recipients: [{ reviewerId: "r1", count: 1 }] };
function sqlOf(value: unknown) {
  if (Array.isArray(value)) return value.join("?");
  return (value as { sql: string }).sql;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditFind.mockResolvedValue(null);
  mocks.auditCreate.mockResolvedValue({});
  mocks.execute.mockResolvedValue(1);
  mocks.query.mockImplementation(async (query: unknown) => {
    const sql = sqlOf(query);
    if (sql.includes('FROM "SubmissionPeriod"')) return [{ id: "period", startDate: new Date("2026-07-01T00:00:00Z"), endDate: new Date("2026-07-31T00:00:00Z") }];
    if (sql.includes('FROM "User"')) return [{ id: "r1", username: "reviewer", displayName: "审核员" }];
    return [{ id: "v1", platform: "douyin", creatorUid: "a" }, { id: "v2", platform: "douyin", creatorUid: "a" }];
  });
  mocks.transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) => run({ $queryRaw: mocks.query, $executeRaw: mocks.execute, auditLog: { findFirst: mocks.auditFind, create: mocks.auditCreate } }));
});
describe("审核分配事务与重试", () => {
  it("同一请求重试返回首个结果，不重复读取候选稿件或写入分配", async () => {
    const first = await assignPeriodReviews("period", input, actor);
    expect(first).toMatchObject({ assigned: 1, remaining: 1 });
    const details = mocks.auditCreate.mock.calls[0][0].data.details;
    mocks.auditFind.mockResolvedValue({ details });
    const second = await assignPeriodReviews("period", input, actor);
    expect(second).toEqual(first);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls.filter((call) => sqlOf(call[0]).includes('FROM "VideoStat"'))).toHaveLength(1);
    expect(mocks.auditFind.mock.calls[0][0].where).toMatchObject({ actorId: "operator", targetId: "period" });
    await expect(assignPeriodReviews("period", { ...input, recipients: [{ reviewerId: "r1", count: 2 }] }, actor)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("审核员不能分配，即使直接调用服务也被拒绝", async () => {
    await expect(assignPeriodReviews("period", input, { ...actor, role: "REVIEWER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("超过可用量的分配不写入或记录成功审计", async () => {
    await expect(assignPeriodReviews("period", { ...input, recipients: [{ reviewerId: "r1", count: 3 }] }, actor)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("候选为空时不产生成功结果", async () => {
    mocks.query.mockResolvedValueOnce([{ id: "period", startDate: new Date("2026-07-01T00:00:00Z"), endDate: new Date("2026-07-31T00:00:00Z") }]).mockResolvedValueOnce([{ id: "r1", username: "reviewer" }]).mockResolvedValueOnce([]);
    await expect(assignPeriodReviews("period", { ...input, expectedEligibleCount: 0 }, actor)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it("预览后候选量增加或减少均要求重新预览，不按旧预览写入", async () => {
    for (const expectedEligibleCount of [1, 3]) {
      await expect(assignPeriodReviews("period", { ...input, mode: "EVEN", expectedEligibleCount }, actor)).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
  it("多组在一次事务中执行，同人跨组只校验一次并合计配额，重试不再次随机或写入", async () => {
    const plan = { requestId: input.requestId, expectedEligibleCount: 2, groups: [
      { mode: "EVEN" as const, totalCount: 1, recipients: [{ reviewerId: "r1" }] },
      { mode: "QUOTA" as const, recipients: [{ reviewerId: "r1", count: 1 }] },
    ] };
    expect(await assignPeriodReviews("period", plan, actor)).toEqual({ assigned: 2, remaining: 0, allocation: [{ reviewerId: "r1", count: 2, username: "reviewer" }] });
    const details = mocks.auditCreate.mock.calls[0][0].data.details;
    expect(details).toMatchObject({ mode: "COMBINED", groups: plan.groups });
    mocks.auditFind.mockResolvedValue({ details });
    expect(await assignPeriodReviews("period", plan, actor)).toMatchObject({ assigned: 2 });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    await expect(assignPeriodReviews("period", { ...plan, groups: [{ ...plan.groups[0], totalCount: 2 }] }, actor)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("组合总量超出可用量或预览候选变化时整批拒绝，不先提交其中一组", async () => {
    const plan = { requestId: input.requestId, expectedEligibleCount: 2, groups: [
      { mode: "EVEN" as const, totalCount: 2, recipients: [{ reviewerId: "r1" }] },
      { mode: "QUOTA" as const, recipients: [{ reviewerId: "r1", count: 1 }] },
    ] };
    await expect(assignPeriodReviews("period", plan, actor)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(assignPeriodReviews("period", { ...plan, expectedEligibleCount: 3 }, actor)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.auditCreate).not.toHaveBeenCalled(); expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
});
