/**
 * 运营端 · 创作灵感管理 · 列表
 * 过滤:?type / ?category / ?published / ?q / ?tag
 */
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ImageIcon, Plus, Sparkles } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  INSPIRATION_TYPES,
  INSPIRATION_TYPE_LABEL,
  MATERIAL_CATEGORY_LABEL,
  type InspirationType,
  type MaterialCategory,
} from "@/lib/validation/inspiration";
import InspirationListFilters from "./_components/InspirationListFilters";

export default async function OperatorInspirationsPage({
  searchParams,
}: {
  searchParams?: {
    type?: string;
    category?: string;
    published?: string;
    q?: string;
    tag?: string;
  };
}) {
  await requireRole("OPERATOR");

  const type = INSPIRATION_TYPES.includes(searchParams?.type as InspirationType)
    ? (searchParams!.type as InspirationType)
    : undefined;
  const category =
    type === "MATERIAL" &&
    isMaterialCategory(searchParams?.category as string | undefined)
      ? (searchParams!.category as MaterialCategory)
      : undefined;
  const published =
    searchParams?.published === "true"
      ? true
      : searchParams?.published === "false"
        ? false
        : undefined;
  const q = searchParams?.q?.trim() ?? "";
  const tag = searchParams?.tag?.trim() ?? "";

  const where: Prisma.InspirationWhereInput = {};
  if (type) where.type = type;
  if (category) where.category = category;
  if (published !== undefined) where.published = published;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }
  if (tag) where.tags = { has: tag };

  const items = await prisma.inspiration.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      type: true,
      category: true,
      title: true,
      summary: true,
      coverImage: true,
      tags: true,
      published: true,
      createdAt: true,
      createdBy: { select: { username: true } },
    },
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">创作灵感管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护视频教程、文档教程、创作素材;发布后会出现在创作者端。
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/inspirations/new">
            <Plus className="size-4" />
            新建灵感
          </Link>
        </Button>
      </header>

      <Card className="mb-5 p-4">
        <InspirationListFilters />
        <p className="mt-3 text-xs text-muted-foreground">
          共 {items.length} 条{items.length >= 200 ? "(仅展示最近 200 条)" : ""}
        </p>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          没有符合条件的灵感。
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={`/operator/inspirations/${i.id}`}
                className="group block h-full"
              >
                <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-ring">
                  <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                    {i.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.coverImage}
                        alt=""
                        className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        {i.type === "MATERIAL" ? (
                          <ImageIcon className="size-8 opacity-40" />
                        ) : (
                          <Sparkles className="size-8 opacity-40" />
                        )}
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex items-center gap-1">
                      <Badge variant="secondary">
                        {INSPIRATION_TYPE_LABEL[i.type]}
                      </Badge>
                      {i.category && (
                        <Badge variant="outline">
                          {MATERIAL_CATEGORY_LABEL[i.category]}
                        </Badge>
                      )}
                    </div>
                    {!i.published && (
                      <div className="absolute right-2 top-2">
                        <Badge variant="warning">草稿</Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary">
                      {i.title}
                    </h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {i.summary ?? "未填写简介"}
                    </p>
                    {i.tags.length > 0 && (
                      <div className="mt-auto flex flex-wrap gap-1">
                        {i.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                        {i.tags.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{i.tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
                      <span>
                        {i.createdBy?.username ?? "—"}
                      </span>
                      <span>{fmtDate(i.createdAt)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isMaterialCategory(v: string | undefined): boolean {
  return (
    v === "VIDEO" ||
    v === "IMAGE" ||
    v === "TEXT_PROMPT" ||
    v === "TEXT_STORY" ||
    v === "TEXT_OTHER"
  );
}
