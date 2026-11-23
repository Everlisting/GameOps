import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ExternalLink, FileText, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { INSPIRATION_TYPES, MATERIAL_CATEGORIES, INSPIRATION_TYPE_LABEL, MATERIAL_CATEGORY_LABEL, type InspirationType, type MaterialCategory } from "@/lib/validation/inspiration";
import { INSPIRATION_TOPICS, safeResourceUrl } from "@/lib/inspiration-catalog";
import InspirationListFilters from "./_components/InspirationListFilters";

export default async function OperatorInspirationsPage({ searchParams = {} }: { searchParams?: { type?: string; category?: string; published?: string; q?: string; tag?: string; topic?: string; page?: string } }) {
  await requireRole("OPERATOR");
  const type = INSPIRATION_TYPES.find((value) => value === searchParams.type);
  const category = type === "MATERIAL" ? MATERIAL_CATEGORIES.find((value) => value === searchParams.category) : undefined;
  const topic = INSPIRATION_TOPICS.find((entry) => entry.label === searchParams.topic)?.label;
  const published = searchParams.published === "true" ? true : searchParams.published === "false" ? false : undefined;
  const q = searchParams.q?.trim().slice(0, 120);
  const tag = searchParams.tag?.trim().slice(0, 30);
  const where: Prisma.InspirationWhereInput = { ...(type ? { type } : {}), ...(category ? { category } : {}), ...(published !== undefined ? { published } : {}) };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }];
  if (tag || topic) where.tags = { hasEvery: [...new Set([tag, topic].filter((value): value is string => !!value))] };
  const [total, all, live, materials] = await Promise.all([prisma.inspiration.count({ where }), prisma.inspiration.count(), prisma.inspiration.count({ where: { published: true } }), prisma.inspiration.count({ where: { type: "MATERIAL" } })]);
  const pages = Math.max(1, Math.ceil(total / 24));
  const requested = Number(searchParams.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const items = await prisma.inspiration.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 24, take: 24, select: { id: true, type: true, category: true, title: true, summary: true, coverImage: true, tags: true, published: true, createdAt: true, createdBy: { select: { username: true, displayName: true } } } });
  function pageUrl(next: number) { const params = new URLSearchParams(); for (const [key,value] of Object.entries(searchParams)) if (value) params.set(key,value); params.set("page", String(next)); params.set("keepFilters", "1"); return `/operator/inspirations?${params}`; }
  return <div className="flex flex-col gap-6 p-5 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">CONTENT LIBRARY</p><h1 className="text-2xl font-semibold">创作灵感管理</h1><p className="mt-2 text-sm text-muted-foreground">按主题组织素材与教程。已发布内容可供任何访客浏览。</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/inspirations" target="_blank"><ExternalLink data-icon="inline-start" />查看公开创作库</Link></Button><Button asChild><Link href="/operator/inspirations/new"><Plus data-icon="inline-start" />新建资源</Link></Button></div></header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{ label: "全部资源", value: all }, { label: "已发布 · 公开可见", value: live }, { label: "草稿 · 仅后台可见", value: all-live }, { label: "创作素材", value: materials }].map((stat) => <Card key={stat.label} className="shadow-none"><CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{stat.label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold tabular-nums">{stat.value}</CardContent></Card>)}</div>
    <Card className="p-4 shadow-none"><InspirationListFilters /></Card>
    <div className="flex items-center justify-between"><h2 className="font-semibold">资源列表</h2><span className="text-sm text-muted-foreground">共 {total} 条</span></div>
    {items.length === 0 ? <Empty className="rounded-xl border border-dashed"><EmptyHeader><EmptyTitle>没有匹配的资源</EmptyTitle><EmptyDescription>调整筛选条件，或新建一份创作资源。</EmptyDescription></EmptyHeader></Empty> : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr>{["资源", "类型 / 主题", "可见性", "创建人", "发布时间", "操作"].map((label) => <th key={label} scope="col" className="px-5 py-4 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id} className="hover:bg-muted/25"><td className="max-w-sm px-5 py-4"><Link className="flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/operator/inspirations/${item.id}`}><div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">{safeResourceUrl(item.coverImage) ? <img src={safeResourceUrl(item.coverImage)!} alt="" loading="lazy" className="size-full object-cover" /> : <FileText className="size-5 text-muted-foreground" />}</div><div className="min-w-0"><p className="truncate font-medium">{item.title}</p><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.summary || "未填写简介"}</p></div></Link></td><td className="px-5 py-4"><p>{item.category ? MATERIAL_CATEGORY_LABEL[item.category as MaterialCategory] : INSPIRATION_TYPE_LABEL[item.type as InspirationType]}</p><p className="mt-1 text-xs text-muted-foreground">{item.tags.filter((value) => INSPIRATION_TOPICS.some((entry) => entry.label === value)).join(" / ") || "未分类 / 通用"}</p></td><td className="px-5 py-4"><Badge variant={item.published ? "secondary" : "outline"}>{item.published ? "已发布" : "草稿"}</Badge></td><td className="px-5 py-4">{item.createdBy?.displayName ?? item.createdBy?.username ?? "—"}</td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{fmtDate(item.createdAt)}</td><td className="px-5 py-4"><Button asChild variant="outline" size="sm"><Link href={`/operator/inspirations/${item.id}`}>编辑</Link></Button></td></tr>)}</tbody></table></div>}
    {pages > 1 && <nav aria-label="资源分页" className="flex items-center justify-center gap-4">{page > 1 ? <Button variant="outline" asChild><Link href={pageUrl(page-1)}>上一页</Link></Button> : <Button variant="outline" disabled>上一页</Button>}<span className="text-sm">{page} / {pages}</span>{page < pages ? <Button variant="outline" asChild><Link href={pageUrl(page+1)}>下一页</Link></Button> : <Button variant="outline" disabled>下一页</Button>}</nav>}
  </div>;
}
