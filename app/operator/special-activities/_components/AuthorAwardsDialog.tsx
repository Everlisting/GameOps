"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ShortText from "./ShortText";
import { platformVideoId } from "@/lib/special-activities/video-details";

type PoolAward = {
  name: string;
  calculatedCents: number;
  paidCents: number;
  suppressed: boolean;
  notes: string[];
  videoIds: string[];
  excluded: Record<string, string>;
};
type Video = { id: string; externalId?: string; title: string; url: string; recommendedViews: number; dataAt: string | null };
const PAGE_SIZE = 15;
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

export default function AuthorAwardsDialog({ name, uid, account, videos, pools }: {
  name: string;
  uid: string;
  account: string | null;
  videos: Video[];
  pools: PoolAward[];
}) {
  const [poolIndex, setPoolIndex] = useState(0);
  const [page, setPage] = useState(1);
  const sortedVideos = useMemo(() => [...videos].sort((a, b) => b.recommendedViews - a.recommendedViews || a.id.localeCompare(b.id)), [videos]);
  const pool = pools[poolIndex];
  const included = new Set(pool.videoIds);
  const pages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const visible = sortedVideos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm" aria-label={`查看${name}的奖励依据`}>查看依据</Button></DialogTrigger>
      <DialogContent className="no-scrollbar max-h-[85vh] max-w-[calc(100%-2rem)] overflow-y-auto shadow-none sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6">奖励计算依据</DialogTitle>
          <DialogDescription className="flex flex-wrap gap-x-3 gap-y-1">
            <ShortText text={name} /><span>UID <ShortText text={uid} /></span><span>抖音号 <ShortText text={account ?? "—"} /></span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <Select value={String(poolIndex)} onValueChange={(value) => { setPoolIndex(Number(value)); setPage(1); }}>
            <SelectTrigger aria-label="查看奖池依据"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{pools.map((item, index) => <SelectItem key={item.name} value={String(index)}>{item.name} · {money(item.paidCents)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">规则计算金额</dt><dd className="mt-1 font-medium">{money(pool.calculatedCents)}</dd></div>
            <div><dt className="text-muted-foreground">计入本次奖励</dt><dd className="mt-1 font-medium">{money(pool.paidCents)}</dd></div>
          </dl>
          {pool.suppressed && <p className="text-sm text-muted-foreground">该奖池因互斥优先级未计奖，奖励由更高优先级奖池发放。</p>}
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <h3 className="font-medium">计算过程</h3>
            {pool.notes.length ? <ul className="flex flex-col gap-1 text-muted-foreground">{pool.notes.map((note) => <li key={note} className="break-words">{note}</li>)}</ul>
              : <p className="text-muted-foreground">未进入最终计奖范围，下方可查看稿件排除原因。</p>}
          </div>
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <h3 className="font-medium">本奖池稿件依据</h3>
            <p className="text-xs text-muted-foreground">活动内共 {videos.length} 条，本奖池最终计算范围 {included.size} 条。按推荐播放量从高到低排列。</p>
            <div className="rounded-lg border border-border"><Table>
              <TableHeader><TableRow><TableHead>稿件标题</TableHead><TableHead className="whitespace-nowrap">稿件 ID</TableHead><TableHead className="whitespace-nowrap">推荐播放量</TableHead><TableHead>计奖情况</TableHead></TableRow></TableHeader>
              <TableBody>{visible.map((video) => {
                const reason = pool.excluded[video.id] ?? (!video.dataAt ? "缺少可用指标" : pool.suppressed ? "互斥未计奖" : included.has(video.id) && pool.paidCents > 0 ? "参与计奖" : "未命中奖励");
                const externalId = platformVideoId(video) ?? "—";
                return <TableRow key={video.id}>
                  <TableCell><ShortText text={video.title} href={video.url} /></TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{externalId}</TableCell>
                  <TableCell>{video.dataAt ? video.recommendedViews.toLocaleString() : "待补数据"}</TableCell>
                  <TableCell><ShortText text={reason} /></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table></div>
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>第 {page} / {pages} 页</span>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一页</Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>下一页</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
