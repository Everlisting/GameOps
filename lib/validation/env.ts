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
  // 阶段9 · 舆情监控
  ANALYSIS_BASE_URL: z.string().url().optional().default("http://127.0.0.1:8000"),
  ANALYSIS_SHARED_SECRET: z.string().min(1, "ANALYSIS_SHARED_SECRET 不能为空").optional().default(""),
  OPINION_AES_KEY: z.string().min(1, "OPINION_AES_KEY 不能为空").optional().default(""),
  // 运行日志(docs/logging.md §13)。logger 直接读 process.env,这里仅校验/留档。
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional().default("info"),
  LOG_SERVICE: z.string().optional().default("gameops-web"),
  LOG_RELEASE: z.string().optional().default(""),
  // 按 module 覆盖级别的 JSON(如 {"feishu.ws":"debug"});格式非法只在 logger 侧告警忽略
  LOG_LEVEL_OVERRIDES: z.string().optional().default(""),
  // HMAC 去身份化密钥;缺失时省略 userIdHash/chatIdHash(不落明文)
  LOG_HASH_SECRET: z.string().optional().default(""),
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
