import type { ActivityVideo } from "./engine";

export function platformVideoId(video: { externalId?: string; url: string }) {
  // 历史结算快照未单独保存平台 ID 时，从原作品链接读取。
  return video.externalId || /\/video\/(\d+)/.exec(video.url)?.[1] || null;
}

export function activityVideoDetails(videos: ActivityVideo[], query: string) {
  const text = query.trim().toLocaleLowerCase();
  return videos.filter((video) => !text || [platformVideoId(video), video.creatorUid, video.creatorAccount]
    .some((value) => value?.toLocaleLowerCase().includes(text)))
    .sort((a, b) => b.recommendedViews - a.recommendedViews || a.id.localeCompare(b.id));
}
