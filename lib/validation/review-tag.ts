import { z } from "zod";

export const reviewTagSchema = z.object({
  name: z.string().trim().min(1, "请输入标签名称").max(32, "名称最多 32 字"),
  description: z.string().trim().max(200).default(""),
  parentId: z.string().min(1).nullable().default(null),
  sortOrder: z.number().int().min(0).max(99999).default(0),
  enabled: z.boolean().default(true),
});
