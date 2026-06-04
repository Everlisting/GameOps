/**
 * POST /api/operator/submissions/batch — 批量改某一项子状态(可附 note),并派生最终态
 * 入参:{ ids: string[], field: "title"|"content"|"yishan", status, note? }
 * 注意:为简化派生最终态,逐条事务更新。≤200 条,可接受。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { submissionBatchReviewSchema } from "@/lib/validation/submission";
import { deriveSubmissionStatus } from "@/lib/submission-review";

const FIELD_MAP = {
  title: { statusKey: "titleStatus", noteKey: "titleNote" },
  content: { statusKey: "contentStatus", noteKey: "contentNote" },
  yishan: { statusKey: "yishanStatus", noteKey: "yishanNote" },
} as const;

export const POST = route(async (req) => {
  await requireRole("OPERATOR");
  const { ids, field, status, note } = await parseJson(
    req,
    submissionBatchReviewSchema,
  );

  const fieldKey = FIELD_MAP[field];

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.submission.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        titleStatus: true,
        contentStatus: true,
        yishanStatus: true,
      },
    });
    const foundIds = new Set(rows.map((r) => r.id));
    const updated: string[] = [];

    for (const row of rows) {
      const next = {
        titleStatus: field === "title" ? status : row.titleStatus,
        contentStatus: field === "content" ? status : row.contentStatus,
        yishanStatus: field === "yishan" ? status : row.yishanStatus,
      };
      const newStatus = deriveSubmissionStatus(
        next.titleStatus,
        next.contentStatus,
        next.yishanStatus,
      );

      await tx.submission.update({
        where: { id: row.id },
        data: {
          [fieldKey.statusKey]: status,
          ...(note !== undefined ? { [fieldKey.noteKey]: note } : {}),
          status: newStatus,
        },
      });
      updated.push(row.id);
    }

    return {
      updated,
      missing: ids.filter((id) => !foundIds.has(id)),
    };
  });

  return Response.json({
    updatedCount: result.updated.length,
    missingIds: result.missing,
  });
});
