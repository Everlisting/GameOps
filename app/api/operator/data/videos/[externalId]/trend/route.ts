/**
 * GET /api/operator/data/videos/[externalId]/trend
 *
 * 单个视频的历史播放趋势:从「每日快照层」DailyVideoStat 取该视频按自然日的
 * (播放量, 推荐播放量) 序列,升序返回。视频数据页点击「趋势」时拉取,前端画折线。
 *
 * 数据来源就是既有的 DailyVideoStat(手动导入 / 爬虫上报每次都会写一份当日快照),
 * 不新增存储。分辨率取决于导入频率:只有「有导入的那天」才有点。
 *
 * 鉴权:OPERATOR 起(与视频数据页一致)。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = route(async (req, { params }) => {
  await requireRole("OPERATOR");

  const externalId = params?.externalId;
  if (!externalId) throw badRequest("缺少 externalId");
  const sp = new URL(req.url).searchParams;
  const platform = sp.get("platform") || "douyin";
  // 曲线窗口:从「发布之日」到「发布当月月底」。传了 publishedAt 才收窄,否则给全量。
  const window = monthWindow(sp.get("publishedAt"));

  const rows = await prisma.dailyVideoStat.findMany({
    where: { platform, externalId },
    orderBy: { snapshotDate: "asc" },
    select: { snapshotDate: true, views: true, recommendedViews: true },
  });

  const series = rows
    .map((r) => ({
      // snapshotDate 是 @db.Date(UTC 零点),截前 10 位即"北京时间这一天"的日期
      date: r.snapshotDate.toISOString().slice(0, 10),
      views: r.views,
      recommendedViews: r.recommendedViews,
    }))
    .filter(
      (s) => !window || (s.date >= window.start && s.date <= window.end),
    );

  return Response.json({ series });
});

/**
 * 由 publishedAt(时间戳)推「发布之日 ~ 发布当月月底」的日期窗口(北京时间口径)。
 * snapshotDate 存的是北京自然日,所以这里把 publishedAt 也换算成北京日历日再取月份。
 * 返回 YYYY-MM-DD 字符串,便于与 series.date 直接字典序比较。publishedAt 缺失/非法 → null(不收窄)。
 */
function monthWindow(iso: string | null): { start: string; end: string } | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const b = new Date(t.getTime() + 8 * 60 * 60 * 1000); // → 北京时间
  const y = b.getUTCFullYear();
  const m = b.getUTCMonth(); // 0-based
  const d = b.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    start: `${y}-${pad(m + 1)}-${pad(d)}`,
    end: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
}
