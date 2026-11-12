/**
 * 管理员后台:运营/管理员账户管理 Zod schema。
 */
import { z } from "zod";
import { STAFF_ROLES } from "@/lib/roles";

// username 保留为唯一登录账号,displayName 是面向用户的「用户名」。
const accountNameSchema = z
  .string()
  .trim()
  .min(3, "账号名称至少 3 个字符")
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "账号名称仅允许字母 / 数字 / 下划线 / 点 / 短横线");

export const operatorDisplayNameSchema = z.string().trim()
  .min(1, "请填写用户名")
  .max(32, "用户名最多 32 个字符")
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, "用户名不能包含控制字符");

export const operatorProfileUpdateSchema = z.object({
  displayName: operatorDisplayNameSchema,
}).strict();

const passwordSchema = z
  .string()
  .min(6, "密码至少 6 个字符")
  .max(128);

const roleSchema = z.enum(STAFF_ROLES, {
  errorMap: () => ({ message: "角色仅支持 REVIEWER / OPERATOR / ADMIN" }),
});

const statusSchema = z.enum(["active", "disabled"]);

export const operatorUserCreateSchema = z.object({
  username: accountNameSchema,
  displayName: operatorDisplayNameSchema,
  password: passwordSchema,
  role: roleSchema,
});

export const operatorUserUpdateSchema = z
  .object({
    role: roleSchema.optional(),
    status: statusSchema.optional(),
  }).strict()
  .refine((d) => d.role !== undefined || d.status !== undefined, {
    message: "未指定要更新的字段",
  });

export const operatorUserPasswordResetSchema = z.object({
  newPassword: passwordSchema,
});

export const operatorUserListQuerySchema = z.object({
  role: roleSchema.optional(),
  status: statusSchema.optional(),
  q: z.string().trim().optional(),
});

export type OperatorUserCreateInput = z.infer<typeof operatorUserCreateSchema>;
