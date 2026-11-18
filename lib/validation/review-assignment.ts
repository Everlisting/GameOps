import { z } from "zod";

const requestFields = {
  requestId: z.string().uuid(),
  expectedEligibleCount: z.number().int().nonnegative(),
};
const groupFields = {
  mode: z.enum(["EVEN", "QUOTA"]),
  totalCount: z.number().int("平均分配总量必须为整数。").positive("请输入大于0的平均分配总量。").max(2147483647).optional(),
  recipients: z.array(z.object({
    reviewerId: z.string().min(1),
    count: z.number().int("分配数量必须为整数。").min(0, "分配数量不能为负数。").max(1000000, "单人分配数量不能超过100万条。").optional(),
  })).min(1, "请至少选择一位审核员。").max(200),
};
type GroupFields = z.infer<z.ZodObject<typeof groupFields>>;
function validateGroup(input: GroupFields, context: z.RefinementCtx, requireTotal: boolean) {
  if (new Set(input.recipients.map((item) => item.reviewerId)).size !== input.recipients.length)
    context.addIssue({ code: "custom", message: "审核员不能重复。", path: ["recipients"] });
  if (input.mode === "QUOTA" && input.recipients.some((item) => !item.count))
    context.addIssue({ code: "custom", message: "请为每位选中的审核员填写大于0的分配数量。", path: ["recipients"] });
  if (requireTotal && input.mode === "EVEN" && input.totalCount === undefined)
    context.addIssue({ code: "custom", message: "请填写本组平均分配总量。", path: ["totalCount"] });
  if (input.mode === "QUOTA" && input.totalCount !== undefined)
    context.addIssue({ code: "custom", message: "指定量模式请填写每人数量。", path: ["totalCount"] });
}
export const reviewAssignmentGroupSchema = z.object(groupFields).superRefine((input, context) => validateGroup(input, context, true));
export type ReviewAssignmentGroup = z.infer<typeof reviewAssignmentGroupSchema>;
export const reviewAssignmentPlanSchema = z.object({
  ...requestFields,
  groups: z.array(reviewAssignmentGroupSchema).min(1, "请添加分配组。").max(20, "最多添加20个分配组。"),
}).superRefine((input, context) => {
  if (new Set(input.groups.flatMap((group) => group.recipients.map((row) => row.reviewerId))).size > 200)
    context.addIssue({ code: "custom", message: "一次最多选择200位审核员。", path: ["groups"] });
  const total = input.groups.reduce((sum, group) => sum + (group.mode === "EVEN" ? group.totalCount ?? 0 : group.recipients.reduce((n, row) => n + (row.count ?? 0), 0)), 0);
  if (total > input.expectedEligibleCount)
    context.addIssue({ code: "custom", message: `各组分配总量不能超过可分配的 ${input.expectedEligibleCount} 条稿件。`, path: ["groups"] });
});
// 兼容已打开页面的旧单组请求；省略平均总量时仍按旧语义分配全部。
const legacyAssignmentSchema = z.unknown().refine((value) => !(typeof value === "object" && value !== null && "groups" in value), "组合分配配置无效。").pipe(
  z.object({ ...requestFields, ...groupFields }).superRefine((input, context) => validateGroup(input, context, false)),
);
export const reviewAssignmentSchema = z.union([reviewAssignmentPlanSchema, legacyAssignmentSchema]);
export type ReviewAssignmentInput = z.infer<typeof reviewAssignmentSchema>;
export function reviewAssignmentGroups(input: ReviewAssignmentInput): ReviewAssignmentGroup[] {
  return "groups" in input ? input.groups : [{ mode: input.mode, totalCount: input.totalCount, recipients: input.recipients }];
}

export const reviewAssignmentResultSchema = z.object({
  assigned: z.number().int().nonnegative(), remaining: z.number().int().nonnegative(),
  allocation: z.array(z.object({ reviewerId: z.string(), count: z.number().int().nonnegative(), username: z.string() })),
});
