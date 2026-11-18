import { z } from "zod";

export const videoReviewHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const videoReviewHistorySchema = z.object({
  rows: z.array(z.object({
    id: z.string(), reviewerName: z.string(), actorUsername: z.string().nullable(),
    reviewedAt: z.string().datetime(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).nullable(),
    tags: z.array(z.object({ id: z.string(), path: z.string() })),
    tagSource: z.enum(["snapshot", "current", "retained", "missing"]),
    source: z.enum(["single", "batch", "current"]),
    note: z.string().nullable(),
  })),
  total: z.number().int().nonnegative(), page: z.number().int().positive(), totalPages: z.number().int().positive(),
});
export type VideoReviewHistory = z.infer<typeof videoReviewHistorySchema>;
