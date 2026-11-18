import { z } from "zod";

const reviewFields = {
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).nullable().optional(),
};
export const videoReviewSchema = z.object({
  ...reviewFields,
  status: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "请选择「已通过」或「未通过」后再保存。" }),
  }),
  tagIds: z.array(z.string().min(1)).min(1, "请选择审核标签。").max(30),
});
export const videoReviewListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).optional(),
  platform: z.string().trim().max(32).optional(),
  visibility: z.enum(["active", "hidden", "all"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => [20, 50, 100].includes(value))
    .optional(),
  videoId: z.string().optional(),
});

export const videoReviewQueueQuerySchema = videoReviewListQuerySchema
  .omit({ status: true, page: true, pageSize: true, videoId: true })
  .extend({ afterId: z.string().min(1).optional() });
