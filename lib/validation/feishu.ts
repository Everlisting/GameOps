/**
 * 阶段6 · 飞书 webhook 入参校验。
 */
import { z } from "zod";

const webhookUrl = z
  .string()
  .url("需为合法 URL")
  .refine((u) => u.includes("/hook/"), "应为飞书自定义机器人 webhook 地址(含 /hook/)");

export const feishuCreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(40),
  url: webhookUrl,
  secret: z.string().trim().max(120).optional(), // 加签密钥,可空
  enabled: z.boolean().optional(),
  dailyReport: z.boolean().optional(),
});

/** 更新:字段皆可选,至少一项。secret 传空串 "" = 清除加签;不传 = 不动。 */
export const feishuUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    url: webhookUrl.optional(),
    secret: z.string().trim().max(120).optional(),
    enabled: z.boolean().optional(),
    dailyReport: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "无更新字段" });
