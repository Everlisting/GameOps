/**
 * 创作灵感 zod schema + 共用枚举/标签映射。
 *
 * 设计:
 *   - type 三态:VIDEO_TUTORIAL / DOC_TUTORIAL / MATERIAL
 *   - category 仅 type=MATERIAL 时使用,非 MATERIAL 一律落 null
 *   - content / url / coverImage 按 type+category 取舍:
 *       VIDEO_TUTORIAL  → 必填 url(视频外链)
 *       DOC_TUTORIAL    → content 与 url 至少二选一
 *       MATERIAL/VIDEO  → 必填 url
 *       MATERIAL/IMAGE  → 必填 url
 *       MATERIAL/TEXT_* → 必填 content
 *   - tags 自由文本,做长度/字符白名单
 *   - published=false 表示草稿,创作者不可见
 *
 * 校验在 inspirationCreateSchema 的 superRefine 里集中做。
 * Update 用 partial 版本,跨字段约束不重做(单字段微调常见,如切换 published)。
 */
import { z } from "zod";

export const INSPIRATION_TYPES = [
  "VIDEO_TUTORIAL",
  "DOC_TUTORIAL",
  "MATERIAL",
] as const;

export const MATERIAL_CATEGORIES = [
  "VIDEO",
  "IMAGE",
  "TEXT_PROMPT",
  "TEXT_STORY",
  "TEXT_OTHER",
] as const;

export type InspirationType = (typeof INSPIRATION_TYPES)[number];
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const INSPIRATION_TYPE_LABEL: Record<InspirationType, string> = {
  VIDEO_TUTORIAL: "视频教程",
  DOC_TUTORIAL: "文档教程",
  MATERIAL: "创作素材",
};

export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  VIDEO: "视频素材",
  IMAGE: "图片素材",
  TEXT_PROMPT: "提示词素材",
  TEXT_STORY: "故事素材",
  TEXT_OTHER: "其他文本素材",
};

/** 推荐标签;输入框 datalist 用;实际可填任意标签 */
export const SUGGESTED_TAGS = [
  "AI创作",
  "实拍指引",
  "图文创作",
  "剧情脚本",
  "剪辑技巧",
  "运镜",
  "选题",
  "封面设计",
] as const;

// ── 字段级 ─────────────────────────────────────────────
const tag = z
  .string()
  .trim()
  .min(1)
  .max(30)
  // 中文 / 英文 / 数字 / 空格 / 常见连接符,避免 SQL/路径里出怪字符
  .regex(/^[一-龥A-Za-z0-9\s\-_+#·]+$/, "标签包含非法字符");

const tagsArray = z.array(tag).max(20, "最多 20 个标签");

const trimToNull = (max: number) =>
  z
    .string()
    .max(max, `不超过 ${max} 字`)
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable();

const optionalUrl = z
  .string()
  .max(500)
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => v == null || /^https?:\/\//i.test(v) || /^\/uploads\//.test(v),
    "请填写 http(s) 链接或上传得到的站内路径",
  );

// ── Create:全字段 + 跨字段校验 ──────────────────────────
export const inspirationCreateSchema = z
  .object({
    type: z.enum(INSPIRATION_TYPES),
    category: z.enum(MATERIAL_CATEGORIES).nullable().default(null),
    title: z.string().trim().min(1, "请填写标题").max(120, "标题不超过 120 字"),
    summary: trimToNull(200),
    content: trimToNull(20000),
    url: optionalUrl,
    coverImage: optionalUrl,
    tags: tagsArray.default([]),
    published: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // MATERIAL 必须选子分类,反之必须为空
    if (data.type === "MATERIAL" && !data.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "创作素材必须选择子类型",
      });
    }
    if (data.type !== "MATERIAL" && data.category) {
      // 教程类强制清空 category,这里给出明确报错而不是静默吞,避免 UI 状态泄漏
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "教程类不能设置素材子类型",
      });
    }

    if (data.type === "VIDEO_TUTORIAL" && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "视频教程必须提供视频链接",
      });
    }
    if (data.type === "DOC_TUTORIAL" && !data.content && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "文档教程需填写正文或外部链接(二选一)",
      });
    }
    if (data.type === "MATERIAL") {
      if (
        (data.category === "VIDEO" || data.category === "IMAGE") &&
        !data.url
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "视频/图片素材必须提供资源链接",
        });
      }
      if (
        (data.category === "TEXT_PROMPT" ||
          data.category === "TEXT_STORY" ||
          data.category === "TEXT_OTHER") &&
        !data.content
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["content"],
          message: "文本素材必须填写正文",
        });
      }
    }
  });

// ── Update:全字段可选,跨字段校验不强制 ───────────────
export const inspirationUpdateSchema = z.object({
  type: z.enum(INSPIRATION_TYPES).optional(),
  category: z.enum(MATERIAL_CATEGORIES).nullable().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  summary: trimToNull(200).optional(),
  content: trimToNull(20000).optional(),
  url: optionalUrl.optional(),
  coverImage: optionalUrl.optional(),
  tags: tagsArray.optional(),
  published: z.boolean().optional(),
});

// ── 列表查询 ─────────────────────────────────────────
export const inspirationListQuerySchema = z.object({
  type: z.enum(INSPIRATION_TYPES).optional(),
  category: z.enum(MATERIAL_CATEGORIES).optional(),
  tag: z.string().trim().max(30).optional(),
  q: z.string().trim().max(120).optional(),
  // 仅运营端用:筛选发布态
  published: z
    .enum(["true", "false", "all"])
    .optional()
    .transform((v) =>
      v === undefined || v === "all" ? undefined : v === "true",
    ),
});

export type InspirationCreateInput = z.infer<typeof inspirationCreateSchema>;
export type InspirationUpdateInput = z.infer<typeof inspirationUpdateSchema>;
