import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { requireRole } from "@/lib/rbac";
import { activityInput, estimateActivity, type ActivityEstimate } from "@/lib/special-activities/db";
import { filterSummary } from "@/lib/special-activities/filters";
import { chinaDateString } from "@/lib/time";
import ConfirmSettlement from "../_components/ConfirmSettlement";
import PoolCalculation from "../_components/PoolCalculation";
import DetailTabs from "../_components/DetailTabs";
import AuthorSearch from "../_components/AuthorSearch";
import AuthorAwardsDialog from "../_components/AuthorAwardsDialog";
import VideoTitle from "../_components/VideoTitle";
import AuthorIdentity from "../_components/AuthorIdentity";
import VideoSearch from "../_components/VideoSearch";
import { AuthorPoolAmounts, VideoPoolResults } from "../_components/PoolResultSummary";
import { matchesAuthor, settlementAuthors } from "@/lib/special-activities/author-details";
import { activityVideoDetails, platformVideoId } from "@/lib/special-activities/video-details";
import { videoPoolResult } from "@/lib/special-activities/pool-details";

const PAGE_SIZE = 30;
const root = "/operator/special-activities";
const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
function pageNumber(value: string | undefined, total: number) {
  return Math.min(Math.max(1, Math.ceil(total / PAGE_SIZE)), /^[1-9]\d*$/.test(value ?? "") ? Number(value) : 1);
}

function Pager({ path, query, field, page, total, anchor }: {
  path: string; query: Record<string, string>; field: string; page: number; total: number; anchor: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tab = field === "videos" ? "videos" : "settlement";
  const href = (n: number) => `${path}?${new URLSearchParams({ ...query, [field]: String(n), tab })}#${anchor}`;
  return <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
    <span>第 {page} / {pages} 页，共 {total} 条</span>
    {page > 1 && <Button variant="outline" size="sm" asChild><Link href={href(page - 1)}>上一页</Link></Button>}
    {page < pages && <Button variant="outline" size="sm" asChild><Link href={href(page + 1)}>下一页</Link></Button>}
  </div>;
}

export default async function SpecialActivityDetail({ params, searchParams }: {
  params: { id: string }; searchParams?: { authors?: string; videos?: string; tab?: string; authorQ?: string; videoQ?: string };
}) {
  await requireRole("OPERATOR");
  const activity = await prisma.specialActivity.findUnique({ where: { id: params.id } });
  if (!activity) notFound();
  const input = activityInput(activity);
  const now = new Date();
  const today = chinaDateString(now);
  const ended = today > input.endDate;
  const pending = today < input.startDate;
  const cutoffPending = activity.cutoffAt && activity.cutoffAt > now;
  const frozen = activity.settlement as { version: 1; estimate: ActivityEstimate } | null;
  let estimate: ActivityEstimate;
  try {
    estimate = frozen?.estimate ?? await estimateActivity(input, now);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "BAD_REQUEST") throw error;
    return <div className="flex flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <Link href={root} className="self-start text-sm text-muted-foreground hover:underline">返回专题活动</Link>
      <h1 className="text-lg font-semibold">{input.title}</h1>
      <p role="alert" className="text-sm text-destructive">暂时无法试算。{error.message}</p>
      <Button className="self-start" variant="outline" asChild><Link href={`${root}/${activity.id}/edit`}>编辑活动</Link></Button>
    </div>;
  }
  const authorCount = estimate.authors.length;
  const videoCount = estimate.videos.length;
  const authorQ = typeof searchParams?.authorQ === "string" ? searchParams.authorQ.trim().slice(0, 160) : "";
  const videoQ = typeof searchParams?.videoQ === "string" ? searchParams.videoQ.trim().slice(0, 160) : "";
  const filteredAuthors = settlementAuthors(estimate).filter((author) => matchesAuthor(author, authorQ));
  const filteredVideos = activityVideoDetails(estimate.videos, videoQ);
  const authorPage = pageNumber(searchParams?.authors, filteredAuthors.length);
  const videoPage = pageNumber(searchParams?.videos, filteredVideos.length);
  const path = `${root}/${activity.id}`;
  const query: Record<string, string> = { authors: String(authorPage), videos: String(videoPage) };
  if (authorQ) query.authorQ = authorQ;
  if (videoQ) query.videoQ = videoQ;
  const poolRecipients = estimate.result.pools.map((pool) => new Map(pool.recipients.map((recipient) => [recipient.author, recipient])));
  const videoPoolMatches = estimate.result.pools.map((pool) => new Map(pool.recipients.flatMap((recipient) => recipient.videoIds.map((id) => [id, recipient] as const))));
  const visibleAuthors = filteredAuthors.sort((a, b) => (estimate.result.authorTotals[b.key] ?? 0) - (estimate.result.authorTotals[a.key] ?? 0) || a.uid.localeCompare(b.uid)).slice((authorPage - 1) * PAGE_SIZE, authorPage * PAGE_SIZE);
  const visibleVideos = filteredVideos.slice((videoPage - 1) * PAGE_SIZE, videoPage * PAGE_SIZE);
  const blocker = !ended ? "活动结束后可确认结算" : cutoffPending ? "等待数据截止时间" : estimate.missingData ? `有 ${estimate.missingData} 条稿件缺少截止指标` : !videoCount ? "暂无匹配稿件" : "";

  return <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-3">
      <Link href={root} className="self-start text-sm text-muted-foreground hover:underline">返回专题活动</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2"><h1 className="break-all text-lg font-semibold">{input.title}</h1><Badge variant={ended || pending ? "muted" : "success"}>{ended ? "已结束" : pending ? "未开始" : "进行中"}</Badge>{activity.settledAt && <Badge variant="outline">已结算</Badge>}</div>
          <p className="text-sm text-muted-foreground">{input.startDate} — {input.endDate} · 北京时间</p>
          {input.description && <p className="max-w-3xl whitespace-pre-wrap break-words text-sm">{input.description}</p>}
        </div>
        {!activity.settledAt && <Button variant="outline" asChild><Link href={`${path}/edit`}>编辑活动</Link></Button>}
      </div>
    </header>
    <section className="flex flex-col gap-3" aria-labelledby="overview-title">
      <h2 id="overview-title" className="text-base font-semibold">活动概览</h2>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
        {[{ label: "匹配稿件", value: videoCount }, { label: "可识别达人", value: authorCount }, { label: "推荐播放量", value: estimate.recommendedViews }, { label: frozen ? "确认金额" : "预估金额", value: yuan(estimate.result.totalCents) }].map(({ label, value }) => <div key={label} className="flex flex-col gap-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-base font-semibold tabular-nums">{value.toLocaleString()}</dd></div>)}
      </dl>
      <p className="break-words text-sm text-muted-foreground">稿件筛选：{filterSummary(input.filters)}</p>
    </section>
    <DetailTabs settled={!!frozen} authorCount={authorCount} videoCount={videoCount} settlement={
    <section id="settlement" className="flex scroll-mt-4 flex-col gap-3" aria-labelledby="settlement-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="settlement-title" className="text-base font-semibold">{frozen ? "结算结果" : "结算预估"}</h2>
          <p className="text-sm text-muted-foreground">{activity.cutoffAt ? `固定截止 ${fmtDateTime(activity.cutoffAt)}` : "确认时冻结"} · 最近一条使用的数据 {estimate.dataAt ? fmtDateTime(estimate.dataAt) : "暂无"}</p>
          {activity.settledAt ? <p className="text-xs text-muted-foreground">确认时间 {fmtDateTime(activity.settledAt)}</p> : blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
          {estimate.missingUid > 0 && <p className="text-xs text-muted-foreground">{estimate.missingUid} 条稿件缺少达人 UID，保留在稿件明细中。</p>}
        </div>
        {!activity.settledAt && <ConfirmSettlement id={activity.id} fingerprint={estimate.fingerprint} totalCents={estimate.result.totalCents} disabled={!!blocker} />}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">奖池规则与计算过程</h3>
        <p className="text-xs text-muted-foreground">展开查看计奖条件、步骤和处理数量，下方达人表展示每人的奖励明细。</p>
        {input.pools.map((pool, i) => <PoolCalculation key={pool.name} pool={pool} outcome={estimate.result.pools[i]} index={i} frozen={!!frozen} />)}
      </div>
      <AuthorSearch matched={filteredAuthors.length} total={authorCount} />
      <p className="text-xs text-muted-foreground">计奖稿件数和推荐播放量仅统计最终实际参与计奖的稿件，跨奖池去重汇总。</p>
      <div className="rounded-xl border border-border bg-card"><Table className="min-w-[960px] table-fixed [&_th]:text-left [&_th]:align-middle [&_th]:whitespace-nowrap [&_td]:text-left [&_td]:align-middle">
        {/* 达人表列宽按下方顺序配置，总和为 100%。窄屏使用表格内横向滚动。 */}
        <colgroup>
          <col className="w-[27%]" />{/* 达人信息 */}
          <col className="w-[12%]" />{/* 计奖稿件数 */}
          <col className="w-[16%]" />{/* 计奖推荐播放量 */}
          <col className="w-[22%]" />{/* 各奖池金额 */}
          <col className="w-[12%]" />{/* 预估激励 */}
          <col className="w-[11%]" />{/* 依据 */}
        </colgroup>
        <TableHeader><TableRow><TableHead>达人信息</TableHead><TableHead>计奖稿件数</TableHead><TableHead>计奖推荐播放量</TableHead><TableHead>各奖池金额</TableHead><TableHead>预估激励</TableHead><TableHead>依据</TableHead></TableRow></TableHeader>
        <TableBody>{visibleAuthors.length ? visibleAuthors.map((author) => <TableRow key={author.key}>
          <TableCell><AuthorIdentity name={author.name} uid={author.uid} account={author.account} /></TableCell>
          <TableCell className="tabular-nums">{author.matchedCount.toLocaleString()}</TableCell>
          <TableCell className="tabular-nums">{author.matchedViews.toLocaleString()}</TableCell>
          <TableCell>
            <AuthorPoolAmounts authorName={author.name} pools={estimate.result.pools.map((pool, i) => {
              const row = poolRecipients[i].get(author.key);
              return { name: pool.name, paidCents: row?.paidCents ?? 0, suppressed: row?.suppressed ?? false };
            })} />
          </TableCell>
          <TableCell className="font-medium tabular-nums">{yuan(estimate.result.authorTotals[author.key] ?? 0)}</TableCell>
          <TableCell>
              <AuthorAwardsDialog name={author.name} uid={author.uid} account={author.account}
                videos={author.videos.map((video) => ({ id: video.id, externalId: video.externalId, title: video.title, url: video.url, recommendedViews: video.recommendedViews, dataAt: video.dataAt }))}
                pools={estimate.result.pools.map((pool, i) => {
                  const row = poolRecipients[i].get(author.key);
                  return {
                    name: pool.name, calculatedCents: row?.calculatedCents ?? 0, paidCents: row?.paidCents ?? 0,
                    suppressed: row?.suppressed ?? false, notes: row?.notes ?? [], videoIds: row?.videoIds ?? [],
                    excluded: Object.fromEntries(author.videos.filter((video) => pool.excluded[video.id]).map((video) => [video.id, pool.excluded[video.id]])),
                  };
                })} />
          </TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{authorQ ? "没有匹配的达人，请调整或清除搜索条件。" : "暂无可试算达人。"}</TableCell></TableRow>}</TableBody>
      </Table></div>
      <Pager path={path} query={query} field="authors" page={authorPage} total={filteredAuthors.length} anchor="activity-detail-tabs" />
    </section>
    } videos={
    <section id="videos" className="flex scroll-mt-4 flex-col gap-3" aria-labelledby="videos-title">
      <h2 id="videos-title" className="text-base font-semibold">稿件明细</h2>
      <VideoSearch matched={filteredVideos.length} total={videoCount} />
      <p className="text-xs text-muted-foreground">按推荐播放量从高到低排列。</p>
      <div className="rounded-xl border border-border bg-card"><Table className="min-w-[1200px] table-fixed [&_th]:text-left [&_th]:align-middle [&_th]:whitespace-nowrap [&_td]:text-left [&_td]:align-middle">
        <colgroup>
          <col className="w-[24%]" />{/* 达人信息 */}
          <col className="w-[22%]" />{/* 稿件标题 */}
          <col className="w-[17%]" />{/* 作品 ID */}
          <col className="w-[13%]" />{/* 发布时间 */}
          <col className="w-[11%]" />{/* 推荐播放量 */}
          <col className="w-[13%]" />{/* 奖池结果 */}
        </colgroup>
        <TableHeader><TableRow><TableHead>达人信息</TableHead><TableHead>稿件标题</TableHead><TableHead>作品 ID</TableHead><TableHead>发布时间</TableHead><TableHead>推荐播放量</TableHead><TableHead>奖池结果</TableHead></TableRow></TableHeader>
        <TableBody>{visibleVideos.length ? visibleVideos.map((video) => <TableRow key={video.id}>
          <TableCell><AuthorIdentity name={video.creatorName ?? "未知"} uid={video.creatorUid} account={video.creatorAccount ?? null} /></TableCell>
          <TableCell><VideoTitle text={video.title} href={video.url} /></TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{platformVideoId(video) ?? "—"}</TableCell>
          <TableCell className="tabular-nums">{fmtDateTime(video.publishedAt)}</TableCell>
          <TableCell className="tabular-nums">{video.dataAt ? video.recommendedViews.toLocaleString() : "待补数据"}{video.dataAt && <p className="text-xs text-muted-foreground">{fmtDateTime(video.dataAt)}</p>}</TableCell>
          <TableCell><VideoPoolResults videoId={platformVideoId(video) ?? video.id} pools={estimate.result.pools.map((pool, i) =>
            videoPoolResult(pool.name, pool.excluded[video.id], videoPoolMatches[i].get(video.id))
          )} /></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{videoQ ? "没有匹配的稿件，请调整或清除搜索条件。" : "暂无符合条件的稿件。"}</TableCell></TableRow>}</TableBody>
      </Table></div>
      <Pager path={path} query={query} field="videos" page={videoPage} total={filteredVideos.length} anchor="activity-detail-tabs" />
    </section>
    } />
  </div>;
}
