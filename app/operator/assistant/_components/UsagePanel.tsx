"use client";

/**
 * AI 助手 · 用量统计面板(ADMIN)。整体卡片 + tokens/请求双曲线 + 各运营用户明细表。
 * 日期区间 URL 同步(from/to);默认近一月由页面服务端给出。
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import DateRangeField from "@/app/operator/_components/DateRangeField";
import { cn } from "@/lib/utils";
import type { UsageStats, UsageUserOption } from "@/lib/assistant/usage";

const ALL_USER: UsageUserOption = { id: "", username: "全部用户" };

const tokenConfig = {
  inputTokens: { label: "输入 tokens", color: "var(--chart-1)" },
  outputTokens: { label: "输出 tokens", color: "var(--chart-2)" },
} satisfies ChartConfig;

const reqConfig = {
  requests: { label: "请求次数", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Y 轴紧凑格式:k / M。 */
function fmtAxis(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function tickDate(v: string): string {
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function UsagePanel({ stats }: { stats: UsageStats }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const maxDate = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  function commitRange(from: string, to: string) {
    const params = new URLSearchParams(search.toString());
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function commitUser(userId: string) {
    const params = new URLSearchParams(search.toString());
    if (userId) params.set("userId", userId);
    else params.delete("userId");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const userItems = [ALL_USER, ...stats.userOptions];
  const activeUser = userItems.find((u) => u.id === (stats.selectedUserId ?? "")) ?? ALL_USER;

  const cards = [
    { label: "总请求数", value: stats.overall.requests.toLocaleString() },
    { label: "输入 tokens", value: stats.overall.inputTokens.toLocaleString() },
    { label: "输出 tokens", value: stats.overall.outputTokens.toLocaleString() },
    { label: "总 tokens", value: stats.overall.totalTokens.toLocaleString() },
    { label: "活跃用户", value: stats.overall.users.toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          统计区间 {stats.range.from} ~ {stats.range.to}
          {stats.selectedUserId && (
            <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-foreground">
              仅 {activeUser.username}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Combobox<UsageUserOption>
            items={userItems}
            value={activeUser}
            onValueChange={(v) => commitUser(v?.id ?? "")}
            itemToStringLabel={(u) => u.username}
            itemToStringValue={(u) => u.id || "__all__"}
            isItemEqualToValue={(a, b) => a.id === b.id}
          >
            <ComboboxInput placeholder="全部用户" className="w-44" />
            <ComboboxContent>
              <ComboboxEmpty>没有匹配的用户。</ComboboxEmpty>
              <ComboboxList>
                {(item: UsageUserOption) => (
                  <ComboboxItem key={item.id || "__all__"} value={item}>
                    {item.username}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <DateRangeField
            from={stats.range.from}
            to={stats.range.to}
            width="w-60"
            clearable={false}
            disabled={{ after: maxDate }}
            onChange={commitRange}
          />
        </div>
      </div>

      {/* 整体消耗卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 双曲线 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="py-0">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-sm">用量(tokens / 天)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ChartContainer config={tokenConfig} className="aspect-auto h-[240px] w-full">
              <LineChart accessibilityLayer data={stats.daily} margin={{ top: 12, left: 8, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={tickDate}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v) => fmtAxis(Number(v))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => new Date(v as string).toLocaleDateString("zh-CN")}
                    />
                  }
                />
                <Line
                  dataKey="inputTokens"
                  type="monotone"
                  stroke="var(--color-inputTokens)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="outputTokens"
                  type="monotone"
                  stroke="var(--color-outputTokens)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-sm">请求次数 / 天</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ChartContainer config={reqConfig} className="aspect-auto h-[240px] w-full">
              <LineChart accessibilityLayer data={stats.daily} margin={{ top: 12, left: 8, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={tickDate}
                />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => new Date(v as string).toLocaleDateString("zh-CN")}
                    />
                  }
                />
                <Line
                  dataKey="requests"
                  type="monotone"
                  stroke="var(--color-requests)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* 各运营用户消耗 */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-sm">各运营用户消耗</CardTitle>
          <CardDescription>按总 tokens 降序</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>运营用户</TableHead>
                <TableHead className="text-right">请求数</TableHead>
                <TableHead className="text-right">输入 tokens</TableHead>
                <TableHead className="text-right">输出 tokens</TableHead>
                <TableHead className="text-right">总 tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.perUser.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    该区间暂无用量
                  </TableCell>
                </TableRow>
              ) : (
                stats.perUser.map((u) => (
                  <TableRow
                    key={u.userId}
                    className={cn(u.userId === stats.selectedUserId && "bg-accent/50")}
                  >
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {u.requests.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {u.inputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {u.outputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {u.totalTokens.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
