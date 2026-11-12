import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { activityValues } from "@/lib/special-activities/db";
import { specialActivitySchema } from "@/lib/special-activities/rules";

export const POST = route(async (req) => {
  const actor = await requireRole("OPERATOR");
  const input = await parseJson(req, specialActivitySchema);
  const saved = await prisma.$transaction(async (tx) => {
    const activity = await tx.specialActivity.create({ data: activityValues(input), select: { id: true } });
    await tx.auditLog.create({ data: {
      action: "specialActivity.create", targetType: "special_activity", targetId: activity.id,
      actorId: actor.sub, actorUsername: actor.username,
    } });
    return activity;
  });
  return Response.json(saved, { status: 201 });
});
