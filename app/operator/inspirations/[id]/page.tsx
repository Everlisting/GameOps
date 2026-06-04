/**
 * 运营端 · 编辑创作灵感
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import InspirationForm from "../_components/InspirationForm";

export default async function EditInspirationPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("OPERATOR");

  const i = await prisma.inspiration.findUnique({
    where: { id: params.id },
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
      published: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { username: true } },
    },
  });
  if (!i) nextNotFound();

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/inspirations"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回灵感列表
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-lg font-semibold">{i.title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          创建于 {fmtDateTime(i.createdAt)}
          {i.createdBy && ` · ${i.createdBy.username}`} · 上次更新{" "}
          {fmtDateTime(i.updatedAt)}
        </p>
      </header>

      <InspirationForm
        mode="edit"
        initial={{
          id: i.id,
          type: i.type,
          category: i.category,
          title: i.title,
          summary: i.summary ?? "",
          content: i.content ?? "",
          url: i.url ?? "",
          coverImage: i.coverImage ?? "",
          tags: i.tags,
          published: i.published,
        }}
      />
    </div>
  );
}
