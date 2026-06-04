/**
 * 管理员后台:运营/管理员账户管理 Zod schema。
 */
import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少 3 个字符")
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "用户名仅允许字母 / 数字 / 下划线 / 点 / 短横线");

const passwordSchema = z
  .string()
  .min(6, "密码至少 6 个字符")
  .max(128);

const roleSchema = z.enum(["OPERATOR", "ADMIN"], {
  errorMap: () => ({ message: "角色仅支持 OPERATOR / ADMIN" }),
});

const statusSchema = z.enum(["active", "disabled"]);

export const operatorUserCreateSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
});

export const operatorUserUpdateSchema = z
  .object({
    role: roleSchema.optional(),
    status: statusSchema.optional(),
  })
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
