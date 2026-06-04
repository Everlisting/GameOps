import { z } from "zod";
import { isAvatarPreset } from "@/lib/avatar-presets";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const optionalUrl = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || /^https?:\/\//i.test(v), {
    message: "请填写以 http(s):// 开头的合法链接",
  });

/** 头像:预设 key 或 http(s) URL,允许为空。 */
const optionalAvatar = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || isAvatarPreset(v) || /^https?:\/\//i.test(v), {
    message: "请选择预设头像或填写以 http(s):// 开头的合法链接",
  });

export const creatorProfileUpdateSchema = z.object({
  nickname: z.string().min(1, "请填写昵称").max(32).optional(),
  avatarUrl: optionalAvatar,
  groupNo: optionalString(64),
  ysId: optionalString(64),
  dyUid: optionalString(64),
  dyName: optionalString(64),
  dyAccount: optionalString(64),
  dyUrl: optionalUrl,
});

export type CreatorProfileUpdateInput = z.infer<typeof creatorProfileUpdateSchema>;

// ── 运营端 ──────────────────────────────────────────────
/** 运营可改的创作者档案字段(比自助多了 tier)。 */
export const operatorCreatorUpdateSchema = z.object({
  nickname: z.string().min(1, "请填写昵称").max(32).optional(),
  tier: optionalString(32),
  groupNo: optionalString(64),
  ysId: optionalString(64),
  dyUid: optionalString(64),
  dyName: optionalString(64),
  dyAccount: optionalString(64),
  dyUrl: optionalUrl,
});

/** 切换创作者账户状态:仅允许 active / disabled。pending 只由注册产生。 */
export const operatorCreatorStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const operatorCreatorListQuerySchema = z.object({
  status: z.enum(["pending", "active", "disabled"]).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type OperatorCreatorUpdateInput = z.infer<
  typeof operatorCreatorUpdateSchema
>;
