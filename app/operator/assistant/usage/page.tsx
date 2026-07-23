/**
 * AI 助手 · 用量统计(成本面板,仅 ADMIN)。
 * 整体消耗卡片 + 按日 tokens/请求曲线 + 各运营用户明细;日期区间筛选,默认近一月。
 */
import { requireRole } from "@/lib/rbac";
import { getUsageStats } from "@/lib/assistant/usage";

import { UsagePanel } from "../_components/UsagePanel";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shanghaiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaultRange(): { from: string; to: string } {
  const to = shanghaiToday();
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 29); // 近一月 = 含今天在内的 30 天
  return { from: d.toISOString().slice(0, 10), to };
}

export default async function AssistantUsagePage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; userId?: string };
}) {
  await requireRole("ADMIN");

  const def = defaultRange();
  const from = searchParams?.from && DATE_RE.test(searchParams.from) ? searchParams.from : def.from;
  const to = searchParams?.to && DATE_RE.test(searchParams.to) ? searchParams.to : def.to;
  const userId = searchParams?.userId || undefined;
  const stats = await getUsageStats(from, to, userId);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">AI 助手 · 用量统计</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          整体消耗、按日趋势、各运营用户明细。默认近一月,可按日期区间筛选。仅管理员可见。
        </p>
      </header>
      <UsagePanel stats={stats} />
    </div>
  );
}
