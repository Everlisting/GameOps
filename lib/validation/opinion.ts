/**
 * 阶段9 · 舆情监控入参校验。
 *
 * 触发接口(private / public)走 multipart form,file 校验在 route.ts 里做(FormData 没法直接 zod),
 * 这里只校验附带的文本字段。
 */
import { z } from "zod";

const trimStr = (max: number) => z.string().trim().max(max);

/** 私域 / 公域触发时附带的表单字段(除 file 外)。 */
export const triggerFormSchema = z.object({
  game: trimStr(64).default("率土之滨"),
  coverageSpan: trimStr(64).optional().transform((v) => v?.trim() || undefined),
});

/** 综合对比触发。 */
export const triggerCombinedSchema = z.object({
  privateTaskId: z.string().trim().min(1, "缺少 privateTaskId"),
  publicTaskId: z.string().trim().min(1, "缺少 publicTaskId"),
  game: trimStr(64).optional().transform((v) => v?.trim() || undefined),
});

/** 列表查询。 */
export const listQuerySchema = z.object({
  scope: z.enum(["private", "public", "combined"]).optional(),
  status: z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** LLM 设置更新。apiKey 必填(空字符串不允许)。 */
export const settingsUpdateSchema = z.object({
  provider: z.enum(["anthropic", "openai", "echo"]),
  model: z.string().trim().min(1, "model 不能为空").max(64),
  apiKey: z.string().trim().min(1, "apiKey 不能为空").max(200),
  baseUrl: z.string().trim().url("baseUrl 需要合法 URL").max(200).optional().or(z.literal("")).transform(
    (v) => (v && v.trim()) || null,
  ),
});

export type TriggerFormInput = z.infer<typeof triggerFormSchema>;
export type TriggerCombinedInput = z.infer<typeof triggerCombinedSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
