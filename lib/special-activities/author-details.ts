import { authorKey, type ActivityVideo, type RewardResult } from "./engine";

type EstimateSource = {
  authors: { key: string; name: string; uid: string; platform: string; count: number }[];
  videos: ActivityVideo[];
  result: RewardResult;
};

export function settlementAuthors(estimate: EstimateSource) {
  const sourceVideos = new Map<string, ActivityVideo[]>();
  for (const video of estimate.videos) {
    const key = authorKey(video);
    if (!key) continue;
    const videos = sourceVideos.get(key);
    if (videos) videos.push(video);
    else sourceVideos.set(key, [video]);
  }
  const awardedIds = new Map<string, Set<string>>();
  for (const pool of estimate.result.pools) {
    for (const recipient of pool.recipients) {
      if (recipient.paidCents <= 0 || recipient.suppressed) continue;
      const ids = awardedIds.get(recipient.author) ?? new Set<string>();
      for (const id of recipient.videoIds) ids.add(id);
      awardedIds.set(recipient.author, ids);
    }
  }
  return estimate.authors.map((author) => {
    const videos = sourceVideos.get(author.key) ?? [];
    const account = videos.find((video) => video.creatorAccount)?.creatorAccount ?? null;
    const ids = awardedIds.get(author.key);
    let matchedCount = 0;
    let matchedViews = 0;
    const searchValues = new Set([author.uid, author.name]);
    for (const video of videos) {
      if (video.creatorAccount) searchValues.add(video.creatorAccount);
      if (video.creatorName) searchValues.add(video.creatorName);
      if (ids?.has(video.id)) {
        matchedCount++;
        matchedViews += video.recommendedViews;
      }
    }
    return { ...author, account, videos, matchedCount, matchedViews, searchValues: [...searchValues] };
  });
}

export function matchesAuthor(author: { searchValues: string[] }, query: string) {
  const text = query.trim().toLocaleLowerCase();
  return !text || author.searchValues.some((value) => value.toLocaleLowerCase().includes(text));
}
