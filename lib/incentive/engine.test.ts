import { describe, it, expect } from "vitest";
import {
  computeIncentives,
  _testing,
  type CreatorMetrics,
} from "./engine";
import type { RewardRule } from "@/lib/validation/activity";

const { evalFormula } = _testing;

const ZERO: Omit<CreatorMetrics, "creatorId"> = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  submissions: 0,
  approvedSubmissions: 0,
};

function mk(id: string, patch: Partial<CreatorMetrics>): CreatorMetrics {
  return { creatorId: id, ...ZERO, ...patch };
}

describe("computeIncentives — 空输入", () => {
  it("无规则无创作者 → 空 Map", () => {
    expect(computeIncentives([], []).size).toBe(0);
  });

  it("有创作者无规则 → 每人 estimated=0,breakdown 空", () => {
    const r = computeIncentives([], [mk("a", { views: 100 })]);
    expect(r.get("a")?.estimated).toBe(0);
    expect(r.get("a")?.breakdown).toEqual([]);
  });

  it("有规则无创作者 → 空 Map(不创建幽灵记录)", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 10,
    };
    expect(computeIncentives([rule], []).size).toBe(0);
  });
});

describe("TIER", () => {
  const rule: RewardRule = {
    kind: "TIER",
    metric: "views",
    tiers: [
      { min: 0, max: 99, amount: 0 },
      { min: 100, max: 999, amount: 10 },
      { min: 1000, amount: 50 }, // 不封顶
    ],
  };

  it("命中中间档", () => {
    const r = computeIncentives([rule], [mk("a", { views: 500 })]);
    expect(r.get("a")?.estimated).toBe(10);
    expect(r.get("a")?.breakdown[0]?.note).toBe("命中 [100, 999]");
  });

  it("命中无上限档", () => {
    const r = computeIncentives([rule], [mk("a", { views: 50000 })]);
    expect(r.get("a")?.estimated).toBe(50);
    expect(r.get("a")?.breakdown[0]?.note).toBe("命中 [1000, ∞]");
  });

  it("cap 截断", () => {
    const capped: RewardRule = { ...rule, cap: 30 };
    const r = computeIncentives([capped], [mk("a", { views: 50000 })]);
    expect(r.get("a")?.estimated).toBe(30);
    expect(r.get("a")?.breakdown[0]?.raw).toBe(50);
    expect(r.get("a")?.breakdown[0]?.amount).toBe(30);
  });

  it("无命中档 → 不进 breakdown", () => {
    const r = computeIncentives(
      [{ kind: "TIER", metric: "views", tiers: [{ min: 100, max: 200, amount: 5 }] }],
      [mk("a", { views: 50 })],
    );
    expect(r.get("a")?.estimated).toBe(0);
    expect(r.get("a")?.breakdown).toEqual([]);
  });
});

describe("FORMULA", () => {
  it("基础四则", () => {
    expect(
      evalFormula(
        [
          { type: "metric", value: "views" },
          { type: "op", value: "*" },
          { type: "number", value: 0.01 },
        ],
        mk("a", { views: 1000 }),
      ),
    ).toBeCloseTo(10);
  });

  it("优先级:加法 vs 乘法", () => {
    // 1 + 2 * 3 = 7
    expect(
      evalFormula(
        [
          { type: "number", value: 1 },
          { type: "op", value: "+" },
          { type: "number", value: 2 },
          { type: "op", value: "*" },
          { type: "number", value: 3 },
        ],
        mk("a", {}),
      ),
    ).toBe(7);
  });

  it("括号改变优先级", () => {
    // (1 + 2) * 3 = 9
    expect(
      evalFormula(
        [
          { type: "op", value: "(" },
          { type: "number", value: 1 },
          { type: "op", value: "+" },
          { type: "number", value: 2 },
          { type: "op", value: ")" },
          { type: "op", value: "*" },
          { type: "number", value: 3 },
        ],
        mk("a", {}),
      ),
    ).toBe(9);
  });

  it("除零返回 0(不抛)", () => {
    expect(
      evalFormula(
        [
          { type: "number", value: 5 },
          { type: "op", value: "/" },
          { type: "number", value: 0 },
        ],
        mk("a", {}),
      ),
    ).toBe(0);
  });

  it("负值经引擎 cap 截到 0", () => {
    // views - 1000,views=200 → -800
    const rule: RewardRule = {
      kind: "FORMULA",
      tokens: [
        { type: "metric", value: "views" },
        { type: "op", value: "-" },
        { type: "number", value: 1000 },
      ],
    };
    const r = computeIncentives([rule], [mk("a", { views: 200 })]);
    expect(r.get("a")?.breakdown[0]?.raw).toBe(-800);
    expect(r.get("a")?.breakdown[0]?.amount).toBe(0);
    expect(r.get("a")?.estimated).toBe(0);
  });

  it("混合指标 + 常数,带 cap", () => {
    // views*0.01 + likes*0.1, cap=50
    const rule: RewardRule = {
      kind: "FORMULA",
      tokens: [
        { type: "metric", value: "views" },
        { type: "op", value: "*" },
        { type: "number", value: 0.01 },
        { type: "op", value: "+" },
        { type: "metric", value: "likes" },
        { type: "op", value: "*" },
        { type: "number", value: 0.1 },
      ],
      cap: 50,
    };
    // views=10000 → 100;likes=200 → 20;总 120;cap=50
    const r = computeIncentives([rule], [mk("a", { views: 10000, likes: 200 })]);
    expect(r.get("a")?.breakdown[0]?.raw).toBeCloseTo(120);
    expect(r.get("a")?.estimated).toBe(50);
  });
});

describe("SHARE_POOL", () => {
  const rule: RewardRule = {
    kind: "SHARE_POOL",
    pool: 1000,
    weightField: "views",
  };

  it("按 views 加权瓜分", () => {
    const r = computeIncentives(
      [rule],
      [
        mk("a", { views: 100 }),
        mk("b", { views: 300 }),
      ],
    );
    // total=400 → a: 250, b: 750
    expect(r.get("a")?.estimated).toBe(250);
    expect(r.get("b")?.estimated).toBe(750);
  });

  it("weight=0 不参与", () => {
    const r = computeIncentives(
      [rule],
      [
        mk("a", { views: 0 }),
        mk("b", { views: 100 }),
      ],
    );
    expect(r.get("a")?.estimated).toBe(0);
    expect(r.get("a")?.breakdown).toEqual([]);
    expect(r.get("b")?.estimated).toBe(1000);
  });

  it("topN 只让前 N 名瓜分", () => {
    const r = computeIncentives(
      [{ ...rule, topN: 2 }],
      [
        mk("a", { views: 100 }),
        mk("b", { views: 300 }),
        mk("c", { views: 600 }),
      ],
    );
    // 取 b/c, total=900 → c: 1000*600/900 ≈ 666.67, b ≈ 333.33
    expect(r.get("c")?.estimated).toBeCloseTo(666.67, 1);
    expect(r.get("b")?.estimated).toBeCloseTo(333.33, 1);
    expect(r.get("a")?.estimated).toBe(0);
  });

  it("全员 weight=0 → 整条规则跳过,无 NaN", () => {
    const r = computeIncentives(
      [rule],
      [mk("a", { views: 0 }), mk("b", { views: 0 })],
    );
    expect(r.get("a")?.estimated).toBe(0);
    expect(r.get("b")?.estimated).toBe(0);
  });
});

describe("RANK", () => {
  const rule: RewardRule = {
    kind: "RANK",
    metric: "views",
    ranks: [
      { from: 1, to: 1, amount: 500 },
      { from: 2, to: 3, amount: 200 },
      { from: 4, to: 10, amount: 50 },
    ],
  };

  it("Top 1 拿 500", () => {
    const r = computeIncentives(
      [rule],
      [
        mk("a", { views: 100 }),
        mk("b", { views: 300 }),
        mk("c", { views: 600 }),
      ],
    );
    expect(r.get("c")?.estimated).toBe(500);
    expect(r.get("b")?.estimated).toBe(200);
    expect(r.get("a")?.estimated).toBe(200);
  });

  it("并列同名 + 跳号", () => {
    // 3 人同分 → 都是第 1 名;第 4 人是第 4 名(不是 2)
    const r = computeIncentives(
      [rule],
      [
        mk("a", { views: 1000 }),
        mk("b", { views: 1000 }),
        mk("c", { views: 1000 }),
        mk("d", { views: 100 }),
      ],
    );
    expect(r.get("a")?.estimated).toBe(500);
    expect(r.get("b")?.estimated).toBe(500);
    expect(r.get("c")?.estimated).toBe(500);
    // d 第 4 名,落入 4~10 档
    expect(r.get("d")?.estimated).toBe(50);
    expect(r.get("d")?.breakdown[0]?.note).toBe("第 4 名");
  });

  it("超出最大档位 → 无贡献", () => {
    // 11+ 名不在任何档
    const arr: CreatorMetrics[] = Array.from({ length: 12 }, (_, i) =>
      mk(`c${i}`, { views: 100 - i }),
    );
    const r = computeIncentives([rule], arr);
    expect(r.get("c11")?.estimated).toBe(0);
    expect(r.get("c11")?.breakdown).toEqual([]);
  });
});

describe("PER_SUBMISSION", () => {
  it("按全部投稿数 × amount", () => {
    const r = computeIncentives(
      [{ kind: "PER_SUBMISSION", amount: 5 }],
      [mk("a", { submissions: 3, approvedSubmissions: 2 })],
    );
    expect(r.get("a")?.estimated).toBe(15);
    expect(r.get("a")?.breakdown[0]?.note).toBe("3 条稿件");
  });

  it("approvedOnly=true → 按已通过数", () => {
    const r = computeIncentives(
      [{ kind: "PER_SUBMISSION", amount: 5, approvedOnly: true }],
      [mk("a", { submissions: 3, approvedSubmissions: 2 })],
    );
    expect(r.get("a")?.estimated).toBe(10);
  });

  it("cap 截断", () => {
    const r = computeIncentives(
      [{ kind: "PER_SUBMISSION", amount: 5, cap: 12 }],
      [mk("a", { submissions: 10 })],
    );
    expect(r.get("a")?.breakdown[0]?.raw).toBe(50);
    expect(r.get("a")?.estimated).toBe(12);
  });

  it("0 条稿件 → 无贡献", () => {
    const r = computeIncentives(
      [{ kind: "PER_SUBMISSION", amount: 5 }],
      [mk("a", { submissions: 0 })],
    );
    expect(r.get("a")?.breakdown).toEqual([]);
  });
});

describe("ACTIVITY_THRESHOLD", () => {
  const rule: RewardRule = {
    kind: "ACTIVITY_THRESHOLD",
    metric: "views",
    threshold: 1000,
    amount: 500,
  };

  it("总数达标 → 均分给所有创作者", () => {
    const r = computeIncentives(
      [rule],
      [
        mk("a", { views: 600 }),
        mk("b", { views: 600 }),
      ],
    );
    // total=1200 ≥ 1000 → 500 / 2 = 250
    expect(r.get("a")?.estimated).toBe(250);
    expect(r.get("b")?.estimated).toBe(250);
  });

  it("总数未达 → 整条规则跳过", () => {
    const r = computeIncentives(
      [rule],
      [mk("a", { views: 400 }), mk("b", { views: 400 })],
    );
    expect(r.get("a")?.estimated).toBe(0);
    expect(r.get("a")?.breakdown).toEqual([]);
  });
});

describe("BASE_PLUS_STEP", () => {
  // 例:metric ≥ 200 → 5;超过 1000 后每 1000 再加 7
  const rule: RewardRule = {
    kind: "BASE_PLUS_STEP",
    metric: "views",
    baseThreshold: 200,
    baseAmount: 5,
    stepStart: 1000,
    stepSize: 1000,
    stepAmount: 7,
  };

  it("未达 baseThreshold → 0", () => {
    const r = computeIncentives([rule], [mk("a", { views: 100 })]);
    expect(r.get("a")?.estimated).toBe(0);
  });

  it("命中 base 但未到 stepStart", () => {
    const r = computeIncentives([rule], [mk("a", { views: 500 })]);
    expect(r.get("a")?.estimated).toBe(5);
  });

  it("metric == stepStart 不触发步进", () => {
    const r = computeIncentives([rule], [mk("a", { views: 1000 })]);
    expect(r.get("a")?.estimated).toBe(5);
  });

  it("超过 stepStart 触发步进", () => {
    // 2500: floor((2500-1000)/1000)=1 → 5 + 7 = 12
    const r = computeIncentives([rule], [mk("a", { views: 2500 })]);
    expect(r.get("a")?.estimated).toBe(12);
  });

  it("多步进", () => {
    // 4500: floor(3500/1000)=3 → 5 + 21 = 26
    const r = computeIncentives([rule], [mk("a", { views: 4500 })]);
    expect(r.get("a")?.estimated).toBe(26);
  });
});

describe("cpmCap", () => {
  it("cpmCap × views / 1000 截断,views=10000 + cpmCap=5 → 上限 50", () => {
    // 阶梯给 100,cpmCap=5 元/千播,views=10000 → cpm 上限 = 5 * 10000 / 1000 = 50
    const rule: RewardRule = {
      kind: "TIER",
      metric: "views",
      tiers: [{ min: 0, amount: 100 }],
      cpmCap: 5,
    };
    const r = computeIncentives([rule], [mk("a", { views: 10000 })]);
    const b = r.get("a")?.breakdown[0];
    expect(b?.raw).toBe(100);
    expect(b?.amount).toBe(50);
    expect(b?.cpmCap).toBe(5);
    expect(b?.cpmLimit).toBe(50);
    expect(b?.cappedBy).toBe("cpm");
  });

  it("views=0 时 cpmCap 不生效(不惩罚没播放数据的创作者)", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 100,
      cpmCap: 1, // 严苛
    };
    const r = computeIncentives(
      [rule],
      [mk("a", { submissions: 1, approvedSubmissions: 1, views: 0 })],
    );
    expect(r.get("a")?.estimated).toBe(100);
    expect(r.get("a")?.breakdown[0]?.cpmLimit).toBeNull();
    expect(r.get("a")?.breakdown[0]?.cappedBy).toBeUndefined();
  });

  it("同时配 cap 和 cpmCap → 取更紧的", () => {
    // cap=30,cpmCap=5 元/千 × 10000 views = 50。raw=100 → min(100, 30, 50) = 30,cap 触发
    const rule: RewardRule = {
      kind: "TIER",
      metric: "views",
      tiers: [{ min: 0, amount: 100 }],
      cap: 30,
      cpmCap: 5,
    };
    const r = computeIncentives([rule], [mk("a", { views: 10000 })]);
    expect(r.get("a")?.estimated).toBe(30);
    expect(r.get("a")?.breakdown[0]?.cappedBy).toBe("cap");
  });

  it("cpmCap 比 cap 紧 → cappedBy=cpm", () => {
    // cap=200,cpmCap=5 × 10000 / 1000 = 50。raw=100 → min(100, 200, 50) = 50
    const rule: RewardRule = {
      kind: "TIER",
      metric: "views",
      tiers: [{ min: 0, amount: 100 }],
      cap: 200,
      cpmCap: 5,
    };
    const r = computeIncentives([rule], [mk("a", { views: 10000 })]);
    expect(r.get("a")?.estimated).toBe(50);
    expect(r.get("a")?.breakdown[0]?.cappedBy).toBe("cpm");
  });

  it("cpmCap 没截到 → cappedBy 为 undefined", () => {
    // raw=10, cpmCap=5 × 10000 / 1000 = 50 → 10 不用截
    const rule: RewardRule = {
      kind: "TIER",
      metric: "views",
      tiers: [{ min: 0, amount: 10 }],
      cpmCap: 5,
    };
    const r = computeIncentives([rule], [mk("a", { views: 10000 })]);
    const b = r.get("a")?.breakdown[0];
    expect(b?.amount).toBe(10);
    expect(b?.cappedBy).toBeUndefined();
    expect(b?.cpmCap).toBe(5);
    expect(b?.cpmLimit).toBe(50);
  });

  it("FORMULA 负值经 cpmCap 仍归 0", () => {
    const rule: RewardRule = {
      kind: "FORMULA",
      tokens: [
        { type: "metric", value: "views" },
        { type: "op", value: "-" },
        { type: "number", value: 1_000_000 },
      ],
      cpmCap: 5,
    };
    const r = computeIncentives([rule], [mk("a", { views: 10000 })]);
    expect(r.get("a")?.estimated).toBe(0);
  });
});

describe("PER_SUBMISSION.minViews", () => {
  it("有 submissionViews 明细时按 minViews 过滤", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 10,
      minViews: 10000,
    };
    const r = computeIncentives(
      [rule],
      [
        mk("a", {
          submissions: 3,
          approvedSubmissions: 3,
          submissionViews: [
            { approved: true, views: 50000 }, // 计
            { approved: true, views: 10000 }, // 计(等于 ≥)
            { approved: true, views: 5000 }, // 不计
          ],
        }),
      ],
    );
    // 2 条达标 × 10 = 20
    expect(r.get("a")?.estimated).toBe(20);
    expect(r.get("a")?.breakdown[0]?.note).toContain("播放量 ≥ 10000");
  });

  it("minViews + approvedOnly 同时:AND 关系", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 10,
      minViews: 10000,
      approvedOnly: true,
    };
    const r = computeIncentives(
      [rule],
      [
        mk("a", {
          submissions: 3,
          approvedSubmissions: 2,
          submissionViews: [
            { approved: true, views: 50000 }, // 计
            { approved: true, views: 5000 }, // 播放量不够,不计
            { approved: false, views: 100000 }, // 未通过,不计
          ],
        }),
      ],
    );
    expect(r.get("a")?.estimated).toBe(10);
  });

  it("minViews=0 等价于不设(全部计入)", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 10,
      minViews: 0,
    };
    const r = computeIncentives(
      [rule],
      [mk("a", { submissions: 3, approvedSubmissions: 3 })],
    );
    expect(r.get("a")?.estimated).toBe(30);
  });

  it("配了 minViews 但没 submissionViews 明细 → 降级用 submissions 计数 + note 标记", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 10,
      minViews: 10000,
    };
    const r = computeIncentives(
      [rule],
      [mk("a", { submissions: 2, approvedSubmissions: 2 })],
    );
    expect(r.get("a")?.estimated).toBe(20);
    expect(r.get("a")?.breakdown[0]?.note).toContain("minViews 已配但缺播放明细");
  });

  it("过滤后 0 条 → 整条规则跳过", () => {
    const rule: RewardRule = {
      kind: "PER_SUBMISSION",
      amount: 10,
      minViews: 10000,
    };
    const r = computeIncentives(
      [rule],
      [
        mk("a", {
          submissions: 2,
          approvedSubmissions: 2,
          submissionViews: [
            { approved: true, views: 100 },
            { approved: true, views: 500 },
          ],
        }),
      ],
    );
    expect(r.get("a")?.estimated).toBe(0);
    expect(r.get("a")?.breakdown).toEqual([]);
  });
});

describe("组合叠加", () => {
  it("TIER + PER_SUBMISSION + RANK 三条同时生效", () => {
    const rules: RewardRule[] = [
      {
        kind: "TIER",
        metric: "views",
        tiers: [{ min: 100, amount: 10 }],
      },
      { kind: "PER_SUBMISSION", amount: 5 },
      {
        kind: "RANK",
        metric: "views",
        ranks: [{ from: 1, to: 1, amount: 100 }],
      },
    ];
    const r = computeIncentives(rules, [
      mk("a", { views: 500, submissions: 2 }),
      mk("b", { views: 200, submissions: 1 }),
    ]);
    // a: TIER 10 + 稿件 10 + RANK 100 = 120
    expect(r.get("a")?.estimated).toBe(120);
    expect(r.get("a")?.breakdown).toHaveLength(3);
    // b: TIER 10 + 稿件 5 + 没排进 = 15
    expect(r.get("b")?.estimated).toBe(15);
    expect(r.get("b")?.breakdown).toHaveLength(2);
  });

  it("breakdown 顺序与 rules 顺序一致", () => {
    const rules: RewardRule[] = [
      { kind: "PER_SUBMISSION", amount: 5 },
      {
        kind: "TIER",
        metric: "views",
        tiers: [{ min: 0, amount: 1 }],
      },
    ];
    const r = computeIncentives(rules, [mk("a", { submissions: 1 })]);
    expect(r.get("a")?.breakdown.map((b) => b.kind)).toEqual([
      "PER_SUBMISSION",
      "TIER",
    ]);
    expect(r.get("a")?.breakdown[0]?.ruleIndex).toBe(0);
    expect(r.get("a")?.breakdown[1]?.ruleIndex).toBe(1);
  });
});
