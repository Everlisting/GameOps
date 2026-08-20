/**
 * 阶段6 · 飞书 webhook 入参校验。
 */
import { z } from "zod";
import { FEISHU_CARD_TEMPLATES } from "@/lib/feishu/report-model";

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

/** 单向推送 · 运营数据日报全局配置。 */
export const feishuReportConfigSchema = z
  .object({
    titleTemplate: z.string().trim().min(1, "日报标题不能为空").max(80),
    cardTemplate: z.enum(FEISHU_CARD_TEMPLATES),
    intro: z.string().trim().max(1000),
    showVideoSummary: z.boolean(),
    videoSummaryTitle: z.string().trim().min(1, "视频汇总标题不能为空").max(60),
    showTopVideos: z.boolean(),
    topVideosTitle: z.string().trim().min(1, "热门作品标题不能为空").max(60),
    topVideoLimit: z.number().int().min(1).max(10),
    showActivities: z.boolean(),
    activitiesTitle: z.string().trim().min(1, "活动标题不能为空").max(60),
    footer: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    const hasContent =
      value.intro.length > 0 ||
      value.footer.length > 0 ||
      value.showVideoSummary ||
      value.showTopVideos ||
      value.showActivities;
    if (!hasContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "至少保留一个内容模块，或填写开场白/结尾",
        path: ["intro"],
      });
    }
  });

/** 双向对话 · 自建应用配置(密钥字段仅在非空时覆盖)。 */
export const feishuAppSchema = z
  .object({
    appId: z
      .string()
      .trim()
      .max(64)
      .refine(
        (value) => value === "" || /^cli_[0-9a-fA-F]{16}$/.test(value),
        "App ID 格式不正确",
      )
      .optional(),
    appSecret: z.string().trim().max(128).optional(),
    verificationToken: z.string().trim().max(128).optional(),
    encryptKey: z.string().trim().max(128).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "无更新字段" });

/** PATCH 会话白名单:allowed 开关 */
export const feishuChatPatchSchema = z.object({ allowed: z.boolean() });
