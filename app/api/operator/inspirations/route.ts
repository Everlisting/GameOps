/**
 * POST /api/operator/inspirations — 运营/管理员新建创作灵感
 * (GET 列表直接由 server component 走 prisma,无需 API)
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { inspirationCreateSchema } from "@/lib/validation/inspiration";

export const POST = route(async (req) => {
  const session = await requireRole("OPERATOR");
  const input = await parseJson(req, inspirationCreateSchema);

  const created = await prisma.inspiration.create({
    data: {
      type: input.type,
      // 教程类一律把 category 落 null,即使前端误传也修正
      category: input.type === "MATERIAL" ? input.category : null,
      title: input.title,
      summary: input.summary,
      content: input.content,
      url: input.url,
      coverImage: input.coverImage,
      tags: input.tags,
      published: input.published,
      createdById: session.sub,
    },
    select: { id: true },
  });

  return Response.json(created, { status: 201 });
});
