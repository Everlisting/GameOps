import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { activityVideos, estimateActivity } from "@/lib/special-activities/db";
import { authorKey } from "@/lib/special-activities/engine";
import { specialActivitySchema, specialMatchSchema } from "@/lib/special-activities/rules";

const schema = z.union([
  z.object({ kind: z.literal("match"), input: specialMatchSchema }),
  z.object({ kind: z.literal("estimate"), input: specialActivitySchema, author: z.string().max(400).optional() }),
]);

export const POST = route(async (req) => {
  await requireRole("OPERATOR");
  const request = await parseJson(req, schema);
  if (request.kind === "match") {
    const videos = await activityVideos({ ...request.input, settlementMode: "CONFIRMATION", cutoffAt: null });
    return Response.json({ total: videos.length, authors: new Set(videos.map(authorKey).filter(Boolean)).size, sample: videos.slice(0, 6) });
  }
  const estimate = await estimateActivity(request.input);
  const selected = request.author ?? estimate.authors[0]?.key;
  return Response.json({
    authors: estimate.authors, selected, totalCents: estimate.result.totalCents,
    missingData: estimate.missingData, missingUid: estimate.missingUid, dataAt: estimate.dataAt,
    authorTotal: selected ? estimate.result.authorTotals[selected] ?? 0 : 0,
    videos: estimate.videos.filter((video) => authorKey(video) === selected),
    pools: estimate.result.pools.map((pool) => ({
      name: pool.name, stepCounts: pool.stepCounts,
      result: pool.recipients.find((row) => row.author === selected),
      excluded: Object.fromEntries(estimate.videos.filter((video) => authorKey(video) === selected && pool.excluded[video.id])
        .map((video) => [video.id, pool.excluded[video.id]])),
    })),
  });
});
