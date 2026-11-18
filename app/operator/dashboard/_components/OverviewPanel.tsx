import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OverviewPanel({
  title,
  description,
  href,
  action = "查看全部",
  children,
}: {
  title: string;
  description: string;
  href: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <CardTitle>
            <h2 className="text-base font-semibold">{title}</h2>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="min-h-11 shrink-0">
          <Link href={href}>
            {action}
            <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {children}
      </CardContent>
    </Card>
  );
}

export function OverviewPanelSkeleton() {
  return (
    <div
      role="status"
      aria-label="概览数据加载中"
      className="min-w-0 rounded-xl border bg-card p-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none"
    >
      <div aria-hidden="true" className="flex flex-col gap-5">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </div>
  );
}
