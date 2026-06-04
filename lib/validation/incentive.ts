/**
 * 激励:人工调整 schema。
 *
 * adjusted=null  撤销人工调整(回退到 estimated)
 * adjusted=number 锁定的最终金额(>=0,≤100,000,000 元 ≈ 1 亿封顶,够用)
 *
 * reason 可选;留 audit 用;最长 1000 字。
 */
import { z } from "zod";

export const incentiveAdjustSchema = z.object({
  adjusted: z
    .number()
    .nonnegative("金额必须 ≥ 0")
    .max(100_000_000, "金额过大")
    .nullable(),
  reason: z
    .string()
    .trim()
    .max(1000, "原因过长")
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
});

export type IncentiveAdjustInput = z.infer<typeof incentiveAdjustSchema>;
