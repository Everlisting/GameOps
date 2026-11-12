import { describe, expect, it } from "vitest";
import { videoPoolResult } from "./pool-details";

describe("稿件奖池结果分类", () => {
  it("有正向实际奖励才归入参与计奖，零元和未入围归入未命中", () => {
    expect(videoPoolResult("奖池", undefined, { paidCents: 100, suppressed: false })).toEqual({ name: "奖池", status: "awarded", reason: "参与计奖" });
    expect(videoPoolResult("奖池", undefined, { paidCents: 0, suppressed: false }).status).toBe("unmatched");
    expect(videoPoolResult("奖池", undefined).status).toBe("unmatched");
  });

  it("互斥归类与未命中分开，排除理由优先且保留原始步骤原因", () => {
    const recipient = { paidCents: 0, suppressed: true };
    expect(videoPoolResult("新手奖", undefined, recipient)).toEqual({ name: "新手奖", status: "suppressed", reason: "互斥未计奖" });
    expect(videoPoolResult("新手奖", "未通过步骤 1 · 条件筛选", recipient)).toEqual({ name: "新手奖", status: "unmatched", reason: "未通过步骤 1 · 条件筛选" });
    expect(videoPoolResult("新手奖", "缺少可用指标").reason).toBe("缺少可用指标");
  });
});
