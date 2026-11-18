import { Eye, Radio, Film, Users, TrendingUp, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardData } from "../_lib/aggregate";
import { compact, percent } from "../_lib/format";
import { MetricValueTooltip } from "./MetricValueTooltip";

export function KpiSummary({ totals: t }: { totals: DashboardData["totals"] }) {
  const reviewed = t.approved + t.rejected;
  const metrics = [
    {
      label: "累计播放量",
      value: compact(t.views),
      detail: `${t.views.toLocaleString("zh-CN")} 次`,
      note: "所选作品的最新累计值",
      icon: Eye,
    },
    {
      label: "推荐播放量",
      value: compact(t.recommended),
      detail: `${t.recommended.toLocaleString("zh-CN")} 次`,
      note: "所选作品的最新累计值",
      icon: Radio,
    },
    {
      label: "发布作品",
      value: compact(t.works),
      detail: `${t.works.toLocaleString("zh-CN")} 条`,
      note: "已排除隐藏及无发布日期作品",
      icon: Film,
    },
    {
      label: "参与达人",
      value: compact(t.authors),
      note: "按平台与有效 UID 去重",
      icon: Users,
    },
    {
      label: "高播放作品",
      value: compact(t.highPlayWorks),
      note: "累计播放量 ≥ 10 万",
      icon: TrendingUp,
    },
    {
      label: "审核合格率",
      value: reviewed ? `${percent(t.approved, reviewed)}%` : "—",
      note: `已审核 ${compact(reviewed)} / ${compact(t.works)} 条`,
      icon: ShieldCheck,
    },
  ];
  return (
    <section
      aria-label="核心数据"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
    >
      {metrics.map(({ label, value, detail, note, icon: Icon }) => {
        const card = (
          <Card className="h-full">
            <CardContent className="flex flex-col gap-1.5 p-3.5">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{label}</span>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
              </div>
              <div className="text-2xl font-semibold tracking-tight tabular-nums 2xl:text-3xl">
                {value}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        );
        return detail ? (
          <MetricValueTooltip key={label} label={label} value={detail}>
            {card}
          </MetricValueTooltip>
        ) : (
          <div key={label} className="h-full">
            {card}
          </div>
        );
      })}
    </section>
  );
}
