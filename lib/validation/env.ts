/**
 * 环境变量校验。应用启动尽早 import 一次,缺失/格式错误立刻报错。
 * 其它模块从这里导入 env,不要直接读 process.env。
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET 至少 32 个字符"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  FEISHU_WEBHOOK_URL: z.string().optional().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`环境变量校验失败:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
