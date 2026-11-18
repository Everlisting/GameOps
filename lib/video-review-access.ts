import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";
import { forbidden, notFound } from "@/lib/errors";
import { hasRole } from "@/lib/roles";
import { submissionDate, submissionStatus } from "@/lib/operator-submissions";

export type ReviewActor = Pick<SessionPayload, "sub" | "role">;
export function ensureReviewActor(actor: ReviewActor) {
  if (!hasRole(actor.role, "REVIEWER")) throw forbidden();
}
type QueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function lockReviewAssignments(client: Pick<Prisma.TransactionClient, "$executeRaw">) {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(7264232)`;
}

export function assignedVideoScope(actor: ReviewActor, alias = "v") {
  ensureReviewActor(actor);
  if (actor.role !== "REVIEWER") return Prisma.sql`TRUE`;
  // alias只由代码内常量提供，所有会话/URL数据都作为绑定参数。
  const id = alias === "VideoStat" ? Prisma.sql`"VideoStat"."id"` : Prisma.sql`v."id"`;
  return Prisma.sql`EXISTS (SELECT 1 FROM "VideoReviewAssignment" a WHERE a."videoId" = ${id} AND a."reviewerId" = ${actor.sub})`;
}

export async function assertAssignedVideos(client: QueryClient, ids: string[], actor: ReviewActor) {
  ensureReviewActor(actor);
  if (actor.role !== "REVIEWER") return;
  const unique = [...new Set(ids)];
  if (!unique.length) throw notFound("没有可处理的稿件");
  const rows = await client.$queryRaw<{ videoId: string }[]>(Prisma.sql`
    SELECT "videoId" FROM "VideoReviewAssignment"
    WHERE "reviewerId" = ${actor.sub} AND "videoId" IN (${Prisma.join(unique)})
  `);
  if (rows.length !== unique.length) throw notFound("稿件未分配给你或已不存在，请刷新后重试");
}

export async function assertAssignedExternalVideo(vid: string, actor: ReviewActor) {
  ensureReviewActor(actor);
  if (actor.role !== "REVIEWER") return;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT v."id" FROM "VideoStat" v JOIN "VideoReviewAssignment" a ON a."videoId" = v."id"
    WHERE a."reviewerId" = ${actor.sub} AND v."externalId" = ${vid} AND v."platform" IN ('douyin', '抖音') LIMIT 1
  `;
  if (!rows.length) throw notFound("稿件未分配给你或已不存在");
}

type ScopeSearch = { q?: string; status?: string; platform?: string; visibility?: string; from?: string; to?: string; videoId?: string };
export function assignedReviewWhere(search: ScopeSearch, actor: ReviewActor) {
  const parts: Prisma.Sql[] = [assignedVideoScope(actor)];
  if (search.visibility !== "all") parts.push(Prisma.sql`v."hidden" = ${search.visibility === "hidden"}`);
  const status = submissionStatus(search.status ?? "PENDING");
  if (status) parts.push(Prisma.sql`v."reviewStatus" = ${status}::"ReviewStatus"`);
  if (search.platform) parts.push(Prisma.sql`v."platform" = ${search.platform}`);
  if (search.videoId) parts.push(Prisma.sql`v."id" = ${search.videoId}`);
  const from = submissionDate(search.from), to = submissionDate(search.to, true);
  if (from) parts.push(Prisma.sql`v."publishedAt" >= ${from}`);
  if (to) parts.push(Prisma.sql`v."publishedAt" <= ${to}`);
  const q = search.q?.trim();
  if (q) {
    const name = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    parts.push(Prisma.sql`(v."title" ILIKE ${name} OR v."externalId" ILIKE ${name} OR v."creatorUid" ILIKE ${name})`);
  }
  return Prisma.join(parts, " AND ");
}
