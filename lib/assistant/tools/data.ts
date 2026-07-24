/**
 * 阶段10.2 · AI 助手 · 数据工具(视频 / 主播 / 采集任务)。
 *
 * 全部只读,复用现有查询口径:
 *   - 主播:buildAnchorQuery(hidden 排除 / UTC / 默认本月 / 白名单排序)
 *   - 视频:VideoStat(hidden=false)聚合,窗口默认本月
 *   - 任务:CrawlerTask
 * 返回统一「证据结构」:data + asOf + scope + source + links。
 */
import { tool } from "ai";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { buildAnchorQuery } from "@/app/operator/data/streamers/_lib/query";
import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";

/** 与 buildAnchorQuery 一致的窗口:指定日期则按区间,否则默认本月(排他上界)。 */
function resolveWindow(
  from?: string,
  to?: string,
): { start?: Date; end?: Date; month: string | null } {
  const parse = (s?: string) =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : undefined;
  const f = parse(from);
  const t = parse(to);
  if (f || t) {
    let end: Date | undefined;
    if (t) {
      end = new Date(t);
      end.setDate(end.getDate() + 1);
    }
    return { start: f, end, month: null };
  }
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}

export function streamerProfileTool() {
  return tool({
    description: TOOL_DEFS.streamerProfile.description,
    inputSchema: TOOL_DEFS.streamerProfile.input,
    execute: async (input) => {
      const q = buildAnchorQuery({
        q: input.q,
        groupNo: input.groupNo,
        publishedFrom: input.publishedFrom,
        publishedTo: input.publishedTo,
        sortBy: input.sortBy,
        order: input.order,
      });
      const limit = input.limit ?? 20;
      // ::int / ::float8 强制数值类型,避免 COUNT/SUM 的 bigint 破坏 JSON 序列化
      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT a."uid", a."nickname", a."groupNo", a."fans",
               COALESCE(vs."works", 0)::int          AS works,
               COALESCE(vs."views", 0)::float8       AS views,
               COALESCE(vs."rec", 0)::float8         AS "recommendedViews",
               COALESCE(vs."fansGained", 0)::float8  AS "fansGained",
               COALESCE(ls."anchorDays", 0)::int     AS "anchorDays",
               COALESCE(ls."liveDuration", 0)::float8 AS "liveDuration",
               COALESCE(ls."acu", 0)::float8         AS acu,
               COALESCE(ls."exposureUsers", 0)::float8 AS "exposureUsers",
               COALESCE(ls."enterRoomUsers", 0)::float8 AS "enterRoomUsers"
        FROM "AnchorStat" a
        ${q.aggJoin}
        ${q.liveAggJoin}
        WHERE ${q.rosterWhere}
        ORDER BY ${q.orderSql}
        LIMIT ${limit}`);

      const params = new URLSearchParams();
      if (q.groupNo) params.set("groupNo", q.groupNo);
      params.set("sortBy", q.sortBy);
      params.set("order", q.order);
      return {
        data: rows,
        asOf: new Date().toISOString(),
        scope: {
          groupNo: q.groupNo || null,
          dateFrom: q.publishedFrom || q.defaultMonth,
          dateTo: q.publishedTo || null,
          sortBy: q.sortBy,
          order: q.order,
        },
        source: "AnchorStat + VideoStat(hidden=false) + LiveStat",
        links: [`/operator/data/streamers?${params.toString()}`],
      };
    },
  });
}

export function videoSummaryTool() {
  return tool({
    description: TOOL_DEFS.videoSummary.description,
    inputSchema: TOOL_DEFS.videoSummary.input,
    execute: async (input) => {
      const { start, end, month } = resolveWindow(input.publishedFrom, input.publishedTo);
      const where: Prisma.VideoStatWhereInput = {
        hidden: false,
        ...(start || end
          ? { publishedAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
          : {}),
      };
      const [agg, worksCount] = await Promise.all([
        prisma.videoStat.aggregate({
          where,
          _sum: {
            views: true,
            recommendedViews: true,
            likes: true,
            comments: true,
            shares: true,
            fansGained: true,
          },
        }),
        prisma.videoStat.count({ where }),
      ]);
      return {
        data: {
          worksCount,
          views: agg._sum.views ?? 0,
          recommendedViews: agg._sum.recommendedViews ?? 0,
          likes: agg._sum.likes ?? 0,
          comments: agg._sum.comments ?? 0,
          shares: agg._sum.shares ?? 0,
          fansGained: agg._sum.fansGained ?? 0,
        },
        asOf: new Date().toISOString(),
        scope: { dateFrom: input.publishedFrom ?? month, dateTo: input.publishedTo ?? null },
        source: "VideoStat(hidden=false)",
        links: ["/operator/data/videos"],
      };
    },
  });
}

export function videoRankTool() {
  return tool({
    description: TOOL_DEFS.videoRank.description,
    inputSchema: TOOL_DEFS.videoRank.input,
    execute: async (input) => {
      const { start, end, month } = resolveWindow(input.dateFrom, input.dateTo);
      const limit = input.limit ?? 10;
      const order = input.order === "asc" ? "asc" : "desc";
      const sortBy = input.sortBy ?? "views";
      const asOf = new Date().toISOString();
      const scope = { dateFrom: input.dateFrom ?? month, dateTo: input.dateTo ?? null, sortBy, order };

      // 增长类:基于 DailyVideoStat 观察期(快照日期窗口)播放量净增 = 期末 − 期初(按 externalId)
      if (sortBy === "viewsGrowth" || sortBy === "viewsGrowthRate") {
        const dir = order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
        const orderCol = sortBy === "viewsGrowthRate" ? Prisma.sql`growth_rate` : Prisma.sql`growth`;
        const snapConds: Prisma.Sql[] = [];
        if (start) snapConds.push(Prisma.sql`d."snapshotDate" >= ${start}`);
        if (end) snapConds.push(Prisma.sql`d."snapshotDate" < ${end}`);
        const snapWhere = snapConds.length ? Prisma.sql`WHERE ${Prisma.join(snapConds, " AND ")}` : Prisma.empty;
        const qCond = input.q
          ? Prisma.sql`AND (v."title" ILIKE ${"%" + input.q + "%"} OR v."creatorName" ILIKE ${"%" + input.q + "%"})`
          : Prisma.empty;
        // 净增率排序时排除期初为 0 的(避免 0→N 的无穷大率)
        const rateFilter = sortBy === "viewsGrowthRate" ? Prisma.sql`AND w.first_v > 0` : Prisma.empty;

        const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          WITH w AS (
            SELECT d."platform", d."externalId",
                   (array_agg(d."views" ORDER BY d."snapshotDate" DESC))[1] AS last_v,
                   (array_agg(d."views" ORDER BY d."snapshotDate" ASC))[1]  AS first_v,
                   COUNT(*)::int AS snaps
            FROM "DailyVideoStat" d
            ${snapWhere}
            GROUP BY d."platform", d."externalId"
          )
          SELECT v."title", v."creatorName" AS creator, v."externalId", v."url",
                 v."views"::int              AS views,
                 (w.last_v - w.first_v)::int AS growth,
                 CASE WHEN w.first_v > 0
                      THEN round((w.last_v - w.first_v)::numeric / w.first_v, 4)::float8
                      ELSE NULL END          AS "growthRate",
                 w.snaps                     AS snaps
          FROM w
          JOIN "VideoStat" v
            ON v."platform" = w."platform" AND v."externalId" = w."externalId" AND v."hidden" = false
          WHERE 1=1 ${qCond} ${rateFilter}
          ORDER BY ${orderCol} ${dir} NULLS LAST
          LIMIT ${limit}`);

        return {
          data: rows,
          asOf,
          scope: { ...scope, note: "增长=观察期内(按每日快照)播放量净增,需窗口内有多天快照;单快照则为 0" },
          source: "DailyVideoStat(每日快照) + VideoStat(hidden=false)",
          links: ["/operator/data/videos"],
        };
      }

      // 标准指标:VideoStat 按发布日期窗口直接排名
      const where: Prisma.VideoStatWhereInput = {
        hidden: false,
        ...(start || end
          ? { publishedAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
          : {}),
        ...(input.q
          ? {
              OR: [
                { title: { contains: input.q, mode: "insensitive" } },
                { creatorName: { contains: input.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const rows = await prisma.videoStat.findMany({
        where,
        orderBy: { [sortBy]: order } as Prisma.VideoStatOrderByWithRelationInput,
        take: limit,
        select: {
          title: true,
          creatorName: true,
          externalId: true,
          url: true,
          views: true,
          recommendedViews: true,
          likes: true,
          comments: true,
          shares: true,
          fansGained: true,
          publishedAt: true,
        },
      });
      return {
        data: rows.map((r) => ({ ...r, creator: r.creatorName })),
        asOf,
        scope,
        source: "VideoStat(hidden=false)",
        links: ["/operator/data/videos"],
      };
    },
  });
}

export function crawlerTaskStatusTool() {
  return tool({
    description: TOOL_DEFS.crawlerTaskStatus.description,
    inputSchema: TOOL_DEFS.crawlerTaskStatus.input,
    execute: async (input) => {
      const limit = input.limit ?? 20;
      const tasks = await prisma.crawlerTask.findMany({
        where: input.status ? { status: input.status } : {},
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          sequenceNumber: true,
          errorMessage: true,
          exitCode: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          job: { select: { name: true } },
        },
      });
      return {
        data: tasks.map((t) => ({
          id: t.id,
          job: t.job?.name ?? null,
          seq: t.sequenceNumber,
          status: t.status,
          exitCode: t.exitCode,
          error: t.errorMessage,
          startedAt: t.startedAt,
          finishedAt: t.finishedAt,
        })),
        asOf: new Date().toISOString(),
        scope: { status: input.status ?? null },
        source: "CrawlerTask",
        links: ["/operator/tasks"],
      };
    },
  });
}
