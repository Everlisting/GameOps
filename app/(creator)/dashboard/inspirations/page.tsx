/**
 * 创作者端 · 创作灵感
 * 拉取 published=true 的灵感(最近 200 条),由 InspirationBrowser 客户端做 Tab/标签/搜索。
 */
import { Lightbulb } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { Card } from "@/components/ui/card";
import InspirationBrowser, {
  type InspirationCardData,
} from "./_components/InspirationBrowser";

const FETCH_LIMIT = 200;

export default async function InspirationsPage() {
  await requireCreator();

  const items = await prisma.inspiration.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: FETCH_LIMIT,
    select: {
      id: true,
      type: true,
      category: true,
      title: true,
      summary: true,
      content: true,
      url: true,
      coverImage: true,
      tags: true,
      createdAt: true,
    },
  });

  const cards: InspirationCardData[] = items.map((i) => ({
    id: i.id,
    type: i.type,
    category: i.category,
    title: i.title,
    summary: i.summary,
    content: i.content,
    url: i.url,
    coverImage: i.coverImage,
    tags: i.tags,
    createdAt: i.createdAt.toISOString(),
  }));

  // 标签按出现频次降序,前端云图用
  const counter = new Map<string, number>();
  for (const i of cards) for (const t of i.tags) counter.set(t, (counter.get(t) ?? 0) + 1);
  const allTags = [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  return (
    <div className="p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">创作灵感</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            视频教程、文档教程、创作素材。按 Tab 切换大类,点标签快速过滤。
          </p>
        </div>
        <span className="hidden items-center gap-1 text-xs text-muted-foreground md:inline-flex">
          <Lightbulb className="size-3.5" />
          运营持续更新中
        </span>
      </header>

      {cards.length === 0 ? (
        <Card className="border-dashed p-12 text-center">
          <Lightbulb className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            灵感库正在筹备中,运营上传后会出现在这里。
          </p>
        </Card>
      ) : (
        <InspirationBrowser items={cards} allTags={allTags} />
      )}
    </div>
  );
}
