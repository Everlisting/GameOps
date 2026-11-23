import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { inspirationFiles } from "@/lib/inspiration-files";
import { getCollection, INSPIRATION_COLLECTIONS, INSPIRATION_TOPICS, type InspirationSearchParams, type InspirationCardData } from "@/lib/inspiration-catalog";

const PAGE_SIZE = 24;
const publicSelect = { id: true, type: true, category: true, title: true, summary: true, content: true, url: true, files: true, coverImage: true, tags: true, createdAt: true } as const;
const toCard = (item: Omit<InspirationCardData, "createdAt" | "files"> & { createdAt: Date; files: unknown }): InspirationCardData => ({ ...item, files: inspirationFiles(item), createdAt: item.createdAt.toISOString() });

export async function readPublishedInspirations(params: InspirationSearchParams) {
  const collection = getCollection(params.collection);
  const q = (params.q ?? "").trim().slice(0, 120);
  const tag = (params.tag ?? "").trim().slice(0, 30);
  const topic = INSPIRATION_TOPICS.find((entry) => entry.label === params.topic)?.label ?? "";
  const sort = params.sort === "oldest" ? "oldest" : "newest";
  const where: Prisma.InspirationWhereInput = { published: true };
  if (collection.type) where.type = collection.type;
  if (collection.category) where.category = collection.category;
  if (tag || topic) where.tags = { hasEvery: [...new Set([tag, topic].filter(Boolean))] };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }];
  const [total, groups, tagRows] = await Promise.all([
    prisma.inspiration.count({ where }),
    prisma.inspiration.groupBy({ by: ["type", "category"], where: { published: true }, _count: { _all: true } }),
    prisma.inspiration.findMany({ where: { published: true }, select: { tags: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(params.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const items = await prisma.inspiration.findMany({ where, select: publicSelect, orderBy: [{ createdAt: sort === "oldest" ? "asc" : "desc" }, { id: sort === "oldest" ? "asc" : "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  // 分享详情也必须独立检查发布状态，不能从管理接口读取。
  const active = params.item ? await prisma.inspiration.findFirst({ where: { id: params.item, published: true }, select: publicSelect }) : null;
  const counts = Object.fromEntries(INSPIRATION_COLLECTIONS.map((entry) => [entry.key, groups.filter((g) => !entry.type || (g.type === entry.type && (!entry.category || g.category === entry.category))).reduce((sum, g) => sum + g._count._all, 0)]));
  const tagCounts = new Map<string, number>();
  for (const row of tagRows) for (const value of new Set(row.tags)) tagCounts.set(value, (tagCounts.get(value) ?? 0) + 1);
  const topicCounts = Object.fromEntries(INSPIRATION_TOPICS.map((entry) => [entry.label, tagCounts.get(entry.label) ?? 0]));
  return { items: items.map(toCard), activeItem: active ? toCard(active) : null, total, page, pages, counts, topicCounts, allTags: [...tagCounts].filter(([value]) => !INSPIRATION_TOPICS.some((entry) => entry.label === value)).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).slice(0, 16).map(([value]) => value), filters: { collection: collection.key, topic, q, tag, sort } };
}
