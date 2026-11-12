import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const filterLabels = { TITLE: "视频标题", CREATORS: "创作者名单", VIDEOS: "稿件名单" } as const;
export type ListKind = "CREATORS" | "VIDEOS";
const relation = z.enum(["ALL", "ANY"]);
const unique = (values: string[]) => [...new Set(values)];

export function normalizeVideoLink(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("请使用完整的 HTTP 或 HTTPS 视频链接");
  if (url.username || url.password) throw new Error("视频链接不能包含登录信息");
  url.hash = "";
  const id = douyinVideoId(url);
  return id ? `https://www.douyin.com/video/${id}` : url.toString();
}

function douyinVideoId(url: URL): string | undefined {
  if (!/^(?:www\.)?(?:douyin\.com|iesdouyin\.com)$/.test(url.hostname)) return;
  return /^\/(?:share\/)?video\/(\d+)\/?$/.exec(url.pathname)?.[1];
}

const uid = z.string().trim().min(1, "UID 不能为空").max(160).regex(/^[^\s,，]+$/, "每行填写一个 UID");
const videoLink = z.string().trim().max(2000).transform((value, ctx) => {
  try { return normalizeVideoLink(value); }
  catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `视频链接格式不正确：${value.slice(0, 60)}` });
    return z.NEVER;
  }
});

export const activityFilterRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TITLE"), match: relation, values: z.array(z.string().trim().min(1).max(160)).min(1, "请填写标题关键词").max(12).transform(unique) }),
  z.object({ kind: z.literal("CREATORS"), values: z.array(uid).min(1, "请填写创作者名单").max(100_000).transform(unique) }),
  z.object({ kind: z.literal("VIDEOS"), values: z.array(videoLink).min(1, "请填写稿件名单").max(100_000).transform(unique) }),
]);

const filterConfig = z.object({ match: relation, rules: z.array(activityFilterRuleSchema).max(3) }).superRefine((value, ctx) => {
  if (new Set(value.rules.map((rule) => rule.kind)).size !== value.rules.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "每种筛选字段只能添加一次" });
  }
});

// 旧活动只保存标题关键词，读取时转换为等价配置。
const legacyFilters = z.object({ keywords: z.array(z.string().trim().min(1).max(160)).max(12), match: relation }).strict();
export const activityFiltersSchema = z.preprocess((value) => {
  const legacy = legacyFilters.safeParse(value);
  if (!legacy.success) return value;
  return {
    match: "ALL",
    rules: legacy.data.keywords.length ? [{ kind: "TITLE", match: legacy.data.match, values: unique(legacy.data.keywords) }] : [],
  };
}, filterConfig);

export type ActivityFilters = z.output<typeof activityFiltersSchema>;
export type ActivityFilterRule = z.output<typeof activityFilterRuleSchema>;

type FilterVideo = { title: string; creatorUid: string | null; url: string; platform: string; externalId: string };

export function videoFilterMatcher(filters: ActivityFilters) {
  const predicates = filters.rules.map((rule): ((video: FilterVideo) => boolean) => {
    if (rule.kind === "TITLE") {
      const words = rule.values.map((word) => word.toLocaleLowerCase());
      return (video) => {
        const title = video.title.toLocaleLowerCase();
        return rule.match === "ALL" ? words.every((word) => title.includes(word)) : words.some((word) => title.includes(word));
      };
    }
    const values = new Set(rule.values);
    if (rule.kind === "CREATORS") return (video) => !!video.creatorUid && values.has(video.creatorUid);
    return (video) => {
      if (video.platform === "douyin" && values.has(`https://www.douyin.com/video/${video.externalId}`)) return true;
      try { return values.has(normalizeVideoLink(video.url)); }
      catch { return false; }
    };
  });
  return (video: FilterVideo) => !predicates.length || (filters.match === "ALL"
    ? predicates.every((matches) => matches(video))
    : predicates.some((matches) => matches(video)));
}

export function videoFilterWhere(filters: ActivityFilters): Prisma.VideoStatWhereInput {
  // 大名单交给批量读取后的 Set 匹配，避免触及 PostgreSQL 参数数量限制。
  const largeLists = filters.rules.reduce((sum, rule) => sum + rule.values.length, 0) > 20_000;
  if (largeLists && filters.match === "ANY") return {};
  const clauses: Prisma.VideoStatWhereInput[] = [];
  for (const rule of filters.rules) {
    if (rule.kind === "TITLE") {
      clauses.push({ [rule.match === "ALL" ? "AND" : "OR"]: rule.values.map((word) => ({ title: { contains: word, mode: "insensitive" } })) });
    } else if (rule.kind === "CREATORS" && !largeLists) {
      clauses.push({ creatorUid: { in: rule.values } });
    }
    // 链接需兼容数据库中携带追踪参数的历史值，统一在读取后规范化匹配。
    else if (rule.kind === "VIDEOS" && filters.match === "ANY") return {};
  }
  return clauses.length ? { [filters.match === "ALL" ? "AND" : "OR"]: clauses } : {};
}

export function filterSummary(filters: ActivityFilters): string {
  if (!filters.rules.length) return "活动期内所有可见视频";
  return filters.rules.map((rule) => {
    if (rule.kind === "TITLE") return `标题包含 ${rule.values.join(rule.match === "ALL" ? " 且 " : " 或 ")}`;
    return `${filterLabels[rule.kind]} ${rule.values.length} 项`;
  }).join(filters.match === "ALL" ? "；并且 " : "；或者 ");
}

export function parseListRows(rows: unknown[][], kind: ListKind, requireHeader: boolean): string[] {
  const header = kind === "CREATORS" ? "UID" : "视频链接";
  const nonEmpty = rows.map((cells, index) => ({ cells, line: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].cells.map((cell) => String(cell ?? "").replace(/^\uFEFF/, "").trim());
  const column = headers.findIndex((value) => value.toLocaleLowerCase() === header.toLocaleLowerCase());
  if (column < 0 && (requireHeader || nonEmpty.some(({ cells }) => cells.filter((cell) => String(cell ?? "").trim()).length > 1))) {
    throw new Error(`请提供表头为「${header}」的一列名单`);
  }
  const data = column >= 0 ? nonEmpty.slice(1) : nonEmpty;
  const targetColumn = column >= 0 ? column : headers.findIndex((value) => value !== "");
  const values: string[] = [];
  for (const { cells, line } of data) {
    const cell = cells[targetColumn];
    if (cell === undefined || cell === null || String(cell).trim() === "") continue;
    if (typeof cell === "number" && (!Number.isSafeInteger(cell) || cell < 0)) {
      throw new Error(`第 ${line} 行 UID 可能已丢失精度，请在 Excel 中将 UID 设为文本后重新导入`);
    }
    const value = String(cell).replace(/^\uFEFF/, "").trim();
    const parsed = (kind === "CREATORS" ? uid : videoLink).safeParse(value);
    if (!parsed.success) throw new Error(`第 ${line} 行：${parsed.error.issues[0].message}`);
    values.push(parsed.data);
  }
  return unique(values);
}

export function parsePastedList(text: string, kind: ListKind): string[] {
  return parseListRows(text.split(/\r\n|\n|\r/).map((line) => line.split("\t")), kind, false);
}
