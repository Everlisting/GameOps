import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3, "用户名至少 3 个字符").max(32),
  password: z.string().min(6, "密码至少 6 个字符").max(128),
});

export const registerSchema = loginSchema
  .extend({
    nickname: z.string().min(1, "请填写昵称").max(32),
    email: z.string().email("请填写合法邮箱").max(128),
    confirmPassword: z.string().min(6, "请再次输入密码").max(128),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export const emailChangeSchema = z.object({
  email: z.string().email("请填写合法邮箱").max(128),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "请填写当前密码").max(128),
    newPassword: z.string().min(6, "新密码至少 6 个字符").max(128),
    confirmPassword: z.string().min(6, "请再次输入新密码").max(128),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type EmailChangeInput = z.infer<typeof emailChangeSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
