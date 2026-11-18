import Link from "next/link";
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Files,
  Timer,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  loadSubmissions,
  type SubmissionSearch,
} from "@/lib/operator-submissions";
import type { flattenReviewTags } from "@/lib/review-tags";
import SubmissionsFilters from "./SubmissionsFilters";
import SubmissionsTable from "./SubmissionsTable";

export default function SubmissionsWorkspace({
  data,
  review = false,
  canImport = false,
  searchParams,
  tags = [],
}: {
  data: Awaited<ReturnType<typeof loadSubmissions>>;
  review?: boolean;
  canImport?: boolean;
  searchParams: SubmissionSearch;
  tags?: ReturnType<typeof flattenReviewTags>;
}) {
  const basePath = review
    ? "/operator/submissions/review"
    : "/operator/submissions";
  function pageHref(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams))
      if (value) params.set(key, value);
    params.set("page", String(page));
    return `${basePath}?${params}`;
  }
  const all = data.counts.PENDING + data.counts.APPROVED + data.counts.REJECTED;
  const metrics = [
    {
      label: "稿件总数",
      value: all,
      detail: "当前筛选范围内的全部稿件",
      icon: Files,
    },
    {
      label: "待审核",
      value: data.counts.PENDING,
      detail: "尚未完成全部审核环节",
      icon: Timer,
    },
    {
      label: "已通过",
      value: data.counts.APPROVED,
      detail: "标题、内容与易闪均已通过",
      icon: CheckCheck,
    },
    {
      label: "未通过",
      value: data.counts.REJECTED,
      detail: "至少一个审核环节未通过",
      icon: ClipboardCheck,
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {review ? "稿件审核" : "全部稿件"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {review
              ? "聚焦稿件内容，完成标题、内容与易闪审核。"
              : "查看稿件信息、采集播放量与最终审核结果。"}
          </p>
        </div>
        {review ? (
          canImport && (
            <Button asChild variant="outline">
              <Link href="/operator/submissions/import-yishan">
                <Upload data-icon="inline-start" />
                导入易闪结果
              </Link>
            </Button>
          )
        ) : (
          <Button asChild>
            <Link href="/operator/submissions/review">
              进入稿件审核
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        )}
      </header>
      {!review && (
        <section
          aria-label="稿件统计"
          className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        >
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle>{metric.label}</CardTitle>
                <metric.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-3xl font-semibold tabular-nums tracking-tight">
                  {metric.value.toLocaleString("zh-CN")}
                </p>
                <CardDescription>{metric.detail}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="font-semibold">
                {review ? "审核工作台" : "稿件列表"}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                共 {data.total.toLocaleString("zh-CN")} 条
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {review
                ? "默认显示待审核稿件 · 支持单条与批量处理"
                : "播放量来自最新采集数据，未匹配的稿件显示「—」"}
            </p>
          </div>
          <SubmissionsFilters review={review} activities={data.activities} />
        </CardHeader>
        <CardContent className="p-0">
          <SubmissionsTable
            key={`${basePath}:${data.page}:${JSON.stringify(searchParams)}`}
            rows={data.rows}
            review={review}
            tags={tags}
            initialId={searchParams.submissionId}
          />
        </CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground">
          <span>
            第 {data.page} / {data.totalPages} 页 · 每页 {data.pageSize} 条
          </span>
          <div className="flex items-center gap-2">
            {data.page > 1 ? (
              <Button asChild size="sm" variant="outline">
                <Link href={pageHref(data.page - 1)}>
                  <ChevronLeft data-icon="inline-start" />
                  上一页
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                <ChevronLeft data-icon="inline-start" />
                上一页
              </Button>
            )}
            {data.page < data.totalPages ? (
              <Button asChild size="sm" variant="outline">
                <Link href={pageHref(data.page + 1)}>
                  下一页
                  <ChevronRight data-icon="inline-end" />
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                下一页
                <ChevronRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
