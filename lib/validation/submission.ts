import { z } from "zod";

// ── 创作者端 ─────────────────────────────────────────────
export const submissionCreateSchema = z.object({
  activityId: z.string().min(1).optional(),
  title: z.string().min(1, "请填写标题").max(120),
  url: z.string().url("请填写合法链接"),
  platform: z.string().min(1, "请选择平台").max(32),
});

export const submissionListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  activityId: z.string().optional(),
});

export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>;

// ── 运营端:三子审核 ─────────────────────────────────────
const reviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
const reviewNoteSchema = z
  .string()
  .max(1000, "审核备注过长")
  .nullable()
  .optional();

const subReviewPatchSchema = z
  .object({
    status: reviewStatusSchema.optional(),
    note: reviewNoteSchema,
  })
  .refine((d) => d.status !== undefined || d.note !== undefined, {
    message: "至少需要修改 status 或 note 之一",
  });

/** 单条:可同时改一个或多个子项 */
export const submissionReviewSchema = z
  .object({
    title: subReviewPatchSchema.optional(),
    content: subReviewPatchSchema.optional(),
    yishan: subReviewPatchSchema.optional(),
  })
  .refine((d) => d.title || d.content || d.yishan, {
    message: "未指定要更新的审核项",
  });

/** 批量:固定改某一项的 status(可附 note) */
export const submissionReviewField = z.enum(["title", "content", "yishan"]);
export type SubmissionReviewField = z.infer<typeof submissionReviewField>;

export const submissionBatchReviewSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  field: submissionReviewField,
  status: reviewStatusSchema,
  note: reviewNoteSchema,
});

/** 易闪导入行 */
export const yishanImportRowSchema = z.object({
  platform: z.string().trim().min(1, "platform 必填"),
  externalId: z.string().trim().min(1, "externalId 必填"),
  status: reviewStatusSchema,
  note: reviewNoteSchema,
});

export const yishanImportSchema = z.object({
  rows: z
    .array(yishanImportRowSchema)
    .min(1, "导入数据为空")
    .max(2000, "单次最多导入 2000 行"),
});

// ── 运营端:列表查询 ────────────────────────────────────
export const operatorSubmissionListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  q: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  activityId: z.string().optional(),
  creatorId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});
