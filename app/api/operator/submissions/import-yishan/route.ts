/**
 * POST /api/operator/submissions/import-yishan — 导入易闪审核结果
 * 入参:{ rows: [{ platform, externalId, status, note? }] }
 * 行为:按 (platform, externalId) 唯一索引匹配,upsert yishanStatus / yishanNote,
 *       重新派生最终态。未匹配的行返给运营复核。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { yishanImportSchema } from "@/lib/validation/submission";
import { deriveSubmissionStatus } from "@/lib/submission-review";

export const POST = route(async (req) => {
  await requireRole("OPERATOR");
  const { rows } = await parseJson(req, yishanImportSchema);

  // 用 (platform, externalId) 做主键去重(后者覆盖前者)
  const dedup = new Map<
    string,
    { platform: string; externalId: string; status: typeof rows[number]["status"]; note?: string | null }
  >();
  for (const r of rows) {
    dedup.set(`${r.platform}::${r.externalId}`, r);
  }
  const items = Array.from(dedup.values());

  // 取出所有目标稿件 — 一次性 IN 查询
  const targets = await prisma.submission.findMany({
    where: {
      OR: items.map((r) => ({
        platform: r.platform,
        externalId: r.externalId,
      })),
    },
    select: {
      id: true,
      platform: true,
      externalId: true,
      titleStatus: true,
      contentStatus: true,
      yishanStatus: true,
    },
  });

  const matched = new Map(
    targets.map((t) => [`${t.platform}::${t.externalId}`, t] as const),
  );

  const unmatched: typeof items = [];
  const updates: {
    id: string;
    yishanStatus: typeof items[number]["status"];
    yishanNote: string | null | undefined;
    status: ReturnType<typeof deriveSubmissionStatus>;
  }[] = [];

  for (const r of items) {
    const t = matched.get(`${r.platform}::${r.externalId}`);
    if (!t) {
      unmatched.push(r);
      continue;
    }
    const newStatus = deriveSubmissionStatus(
      t.titleStatus,
      t.contentStatus,
      r.status,
    );
    updates.push({
      id: t.id,
      yishanStatus: r.status,
      yishanNote: r.note ?? undefined,
      status: newStatus,
    });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.submission.update({
        where: { id: u.id },
        data: {
          yishanStatus: u.yishanStatus,
          ...(u.yishanNote !== undefined ? { yishanNote: u.yishanNote } : {}),
          status: u.status,
        },
      }),
    ),
  );

  return Response.json({
    inputCount: rows.length,
    dedupedCount: items.length,
    matchedCount: updates.length,
    unmatched,
  });
});
