import type { InspirationType, MaterialCategory } from "@/lib/validation/inspiration";
import type { InspirationFileData } from "@/lib/inspiration-files";

/** 展示分类复用已有枚举，历史素材无需迁移。 */
export const INSPIRATION_COLLECTIONS = [
  { key: "all", label: "全部资源", description: "从灵感到作品，一站找到创作所需", type: null, category: null },
  { key: "video", label: "视频素材", description: "镜头、片段与剪辑素材", type: "MATERIAL", category: "VIDEO" },
  { key: "image", label: "图片素材", description: "封面、配图与视觉参考", type: "MATERIAL", category: "IMAGE" },
  { key: "audio", label: "音效配乐", description: "声音与背景音乐", type: "MATERIAL", category: "AUDIO" },
  { key: "template", label: "模板文件", description: "剪辑工程与创作模板", type: "MATERIAL", category: "TEMPLATE" },
  { key: "prompt", label: "AI 提示词", description: "把想法转化为可用的生成指令", type: "MATERIAL", category: "TEXT_PROMPT" },
  { key: "story", label: "故事脚本", description: "选题、故事与剧情创作参考", type: "MATERIAL", category: "TEXT_STORY" },
  { key: "text", label: "文本素材", description: "文案与更多文字创作素材", type: "MATERIAL", category: "TEXT_OTHER" },
  { key: "video-tutorial", label: "视频教程", description: "跟着演示学习创作方法", type: "VIDEO_TUTORIAL", category: null },
  { key: "doc-tutorial", label: "文档教程", description: "随时查阅的创作指南", type: "DOC_TUTORIAL", category: null },
] as const satisfies readonly { key: string; label: string; description: string; type: InspirationType | null; category: MaterialCategory | null }[];

export type CollectionKey = (typeof INSPIRATION_COLLECTIONS)[number]["key"];
export const INSPIRATION_TOPICS = [
  { label: "武将立绘", description: "全身、半身与透明底素材", code: "PORTRAITS" },
  { label: "游戏素材", description: "地图、战法、界面与游戏内素材", code: "GAME" },
  { label: "三视图库", description: "角色正面、侧面与背面设定参考", code: "VIEWS" },
  { label: "百大作者", description: "优质作者档案、作品与创作参考", code: "CREATORS" },
  { label: "率土CG", description: "官方动画、宣传片与高清影像", code: "CG" },
  { label: "率土cos", description: "角色写真、花絮与拍摄素材", code: "COS" },
  { label: "故事素材", description: "人物故事、赛季纪事与内容选题", code: "STORIES" },
  { label: "武将设定", description: "武将背景、服饰细节与人物设定", code: "SETTINGS" },
  { label: "联动素材", description: "品牌联动、跨界活动与限定素材", code: "CROSSOVER" },
] as const;

const promptCovers = [
  "/images/inspirations/default-covers/prompt-glass-stack.webp",
  "/images/inspirations/default-covers/prompt-glass-console.webp",
] as const;

const documentCovers = [
  "/images/inspirations/default-covers/document-field-notes.webp",
  "/images/inspirations/default-covers/document-open-guide.webp",
] as const;

export function defaultInspirationCover(item: Pick<InspirationCardData, "id" | "type" | "category">): string | null {
  const covers = item.category === "TEXT_PROMPT" ? promptCovers
    : item.type === "DOC_TUTORIAL" || item.category === "TEXT_OTHER" ? documentCovers
    : null;
  if (!covers) return null;

  let hash = 0x811c9dc5;
  for (const character of item.id) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return covers[Math.floor((hash >>> 0) * covers.length / 0x100000000)];
}

/** 图鉴与设定长幅优先保留全图，竖版封面靠上构图。 */
export function inspirationCoverFit(item: Pick<InspirationCardData, "tags">, ratio?: number): "contain" | "top" | "cover" {
  if (ratio === undefined || ratio > 2.1 || item.tags.some((tag) => tag === "三视图库" || tag === "武将设定")) return "contain";
  if (ratio < 1.1) return "top";
  return "cover";
}
export type InspirationSearchParams = { collection?: string; topic?: string; q?: string; tag?: string; sort?: string; page?: string; item?: string };
export type InspirationCardData = {
  id: string; type: InspirationType; category: MaterialCategory | null;
  title: string; summary: string | null; content: string | null; url: string | null;
  coverImage: string | null; tags: string[]; createdAt: string;
  files?: InspirationFileData[];
};

export function getCollection(key?: string) {
  return INSPIRATION_COLLECTIONS.find((entry) => entry.key === key) ?? INSPIRATION_COLLECTIONS[0];
}

export function collectionForItem(item: { type: InspirationType; category: MaterialCategory | null }) {
  return INSPIRATION_COLLECTIONS.find((entry) => entry.type === item.type && entry.category === item.category) ?? INSPIRATION_COLLECTIONS[0];
}

/** 只允许安全的站内上传路径或 HTTP(S)，也兼容历史记录。 */
export function safeResourceUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^\/uploads\/[^\\\s]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
