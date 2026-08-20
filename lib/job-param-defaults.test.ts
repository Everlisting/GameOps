import { describe, expect, it } from "vitest";

import {
  buildCronParamValues,
  buildManualParamDefaults,
  buildManualTriggerInitialValues,
  type JobParamDefinition,
} from "@/lib/job-param-defaults";

const schema: JobParamDefinition[] = [
  { name: "开始时间", type: "DATE", default: "2026-08-01" },
  { name: "结束时间", type: "DATE", default: "2026-08-02" },
  { name: "cookie", type: "STRING", default: "cron-cookie" },
  { name: "直播场次数据", type: "EXCEL" },
];

describe("job param defaults", () => {
  it("keeps cron values isolated from remembered manual values", () => {
    const manual = buildManualParamDefaults(schema, {
      开始时间: "2026-08-10",
      结束时间: "2026-08-11",
      cookie: "manual-cookie",
      直播场次数据: [{ UID: "1" }],
    });

    expect(manual).toEqual({
      开始时间: "2026-08-10",
      结束时间: "2026-08-11",
      cookie: "manual-cookie",
    });
    expect(buildCronParamValues(schema)).toEqual({
      开始时间: "2026-08-01",
      结束时间: "2026-08-02",
      cookie: "cron-cookie",
    });
  });

  it("prefills manual form from manual memory and falls back per field", () => {
    expect(
      buildManualTriggerInitialValues(schema, {
        开始时间: "2026-08-10",
        cookie: "manual-cookie",
        直播场次数据: [{ UID: "must-not-be-restored" }],
      }),
    ).toEqual({
      开始时间: "2026-08-10",
      结束时间: "2026-08-02",
      cookie: "manual-cookie",
    });
  });

  it("drops stale and empty manual values from the next snapshot", () => {
    expect(
      buildManualParamDefaults(schema, {
        开始时间: "",
        结束时间: "2026-08-11",
        removedParameter: "stale",
      }),
    ).toEqual({ 结束时间: "2026-08-11" });
  });
});
