import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), txQuery: vi.fn(), execute: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
import { getSubmissionPeriod, loadSubmissionPeriods, periodSearch, saveSubmissionPeriod } from "./submission-periods";
const input = { title: "七月稿件", startDate: "2026-07-01", endDate: "2026-07-31", status: "REVIEWING" as const };
const actor = { sub: "o1", username: "operator", role: "OPERATOR" as const };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(1);
  mocks.audit.mockResolvedValue({});
  mocks.query.mockResolvedValue([]);
  mocks.txQuery.mockResolvedValue([{ id: "existing", startDate: new Date("2026-07-01T00:00:00Z"), endDate: new Date("2026-07-31T00:00:00Z") }]);
  mocks.transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) => run({ $queryRaw: mocks.txQuery, $executeRaw: mocks.execute, auditLog: { create: mocks.audit } }));
});
describe("稿件统计周期持久化", () => {
  it("审核员仅能读取自己有分配的周期，详情也受同一限制", async () => {
    const reviewer = { sub: "reviewer", role: "REVIEWER" as const };
    await loadSubmissionPeriods({}, reviewer);
    expect(mocks.query.mock.calls[0][0].values).toContain("reviewer");
    await expect(getSubmissionPeriod("other-period", reviewer)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.query.mock.calls[1][0].values).toContain("reviewer");
  });
  it("分配后不能通过编辑日期把既有任务移出统计范围", async () => {
    mocks.txQuery.mockResolvedValueOnce([{ startDate: new Date("2026-07-01T00:00:00Z"), endDate: new Date("2026-07-31T00:00:00Z") }]).mockResolvedValueOnce([{ videoId: "assigned" }]);
    await expect(saveSubmissionPeriod({ ...input, startDate: "2026-07-02" }, actor, "existing")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("名称与状态组合筛选，名称中的SQL通配符按普通字符搜索", async () => {
    await loadSubmissionPeriods({ q: " 50%_稿件 ", status: "FROZEN" }, actor);
    expect(mocks.query.mock.calls[0][0].values).toEqual(["%50\\%\\_稿件%", "FROZEN"]);
    expect(periodSearch({ q: " 七月 ", status: "invalid" })).toEqual({ q: "七月", status: "" });
    await loadSubmissionPeriods({}, actor);
    expect(mocks.query.mock.calls[1][0].values).toEqual([]);
  });
  it("新建生成独立ID并在同一事务中记录审计，不写视频或征稿表", async () => {
    const saved = await saveSubmissionPeriod(input, actor);
    expect(saved.id).toBeTruthy();
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      targetId: saved.id, actorId: "o1", actorUsername: "operator", action: "submissionPeriod.create", details: input,
    }) });
    expect(mocks.execute.mock.calls[1].slice(1, 5)).toEqual([
      saved.id, input.title, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-31T00:00:00Z"),
    ]);
  });
  it("编辑不存在的周期明确报错，不创建新记录或写入审计", async () => {
    mocks.execute.mockResolvedValue(0);
    mocks.txQuery.mockResolvedValue([]);
    await expect(saveSubmissionPeriod(input, actor, "gone")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.audit).not.toHaveBeenCalled();
    await expect(getSubmissionPeriod("gone", actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("编辑保留ID，审计失败使整个事务拒绝", async () => {
    expect(await saveSubmissionPeriod({ ...input, status: "FROZEN" }, actor, "existing")).toEqual({ id: "existing" });
    expect(mocks.execute.mock.calls[1]).toContain("FROZEN");
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("submissionPeriod.update");
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(saveSubmissionPeriod(input, actor)).rejects.toThrow("audit unavailable");
  });
});
