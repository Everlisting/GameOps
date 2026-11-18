import { z } from "zod";
import { dateValue } from "@/lib/data-period";

const calendarDate = z.string().trim().refine((value) => !!dateValue(value), "请选择有效日期。");
export const submissionPeriodRangeSchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
}).refine((input) => input.startDate <= input.endDate, {
  path: ["endDate"], message: "结束日期不能早于开始日期。",
});

export const submissionPeriodSchema = z.object({
  title: z.string().trim().min(1, "请填写统计名称。").max(120, "名称最多120个字符。"),
  startDate: calendarDate,
  endDate: calendarDate,
  status: z.enum(["REVIEWING", "FROZEN"]).default("REVIEWING"),
}).refine((input) => input.startDate <= input.endDate, {
  path: ["endDate"], message: "结束日期不能早于开始日期。",
});

export type SubmissionPeriodInput = z.infer<typeof submissionPeriodSchema>;
