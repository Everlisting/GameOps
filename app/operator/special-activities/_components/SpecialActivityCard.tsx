import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarRange, ChevronRight } from "lucide-react";
import ActivityCover from "@/app/(creator)/_components/ActivityCover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type ActivityCard = {
  id: string; title: string; description: string; startDate: string; endDate: string;
  status: "未开始" | "进行中" | "已结束"; settled: boolean;
};

export default function SpecialActivityCard({ activity, stats }: { activity: ActivityCard; stats: ReactNode }) {
  return (
    <li>
      <Card className="overflow-hidden shadow-none transition-colors duration-150 hover:border-foreground/20 motion-reduce:transition-none">
        <article aria-labelledby={`special-${activity.id}`} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-4 p-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:p-5">
          <div aria-hidden="true" className="col-start-1 row-start-1 size-16 self-center overflow-hidden rounded-lg sm:row-span-2 sm:size-28">
            <ActivityCover src={null} name={activity.title} />
          </div>
          <CardHeader className="col-start-2 row-start-1 min-w-0 justify-center gap-1.5 p-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CardTitle className="min-w-0 max-w-full text-lg font-semibold leading-7 sm:text-xl"><h2 id={`special-${activity.id}`} className="truncate" title={activity.title}>{activity.title}</h2></CardTitle>
              <Badge variant={activity.status === "进行中" ? "success" : "muted"}>{activity.status}</Badge>
              {activity.settled && <Badge variant="outline">已结算</Badge>}
            </div>
            <CardDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-4">
              <CalendarRange className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only">活动时间：</span>
              <time dateTime={activity.startDate}>{activity.startDate.replaceAll("-", ".")}</time>
              <span>—</span>
              <time dateTime={activity.endDate}>{activity.endDate.replaceAll("-", ".")}</time>
            </CardDescription>
            {activity.description && <CardDescription className="line-clamp-2 leading-4">{activity.description}</CardDescription>}
          </CardHeader>
          <CardContent className="col-span-2 col-start-1 row-start-2 border-t border-border/60 p-0 pt-3 sm:col-start-2">
            {stats}
          </CardContent>
          <CardFooter className="col-span-2 col-start-1 row-start-3 justify-end p-0 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:self-center">
            <Button variant="outline" size="sm" asChild><Link href={`/operator/special-activities/${activity.id}`} aria-label={`查看${activity.title}详情`}>查看详情<ChevronRight data-icon="inline-end" aria-hidden="true" /></Link></Button>
          </CardFooter>
        </article>
      </Card>
    </li>
  );
}
