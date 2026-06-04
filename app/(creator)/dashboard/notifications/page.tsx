/**
 * 创作者端 · 通知(占位)
 * 后续接审核结果、活动开始/结束、激励发放等通知;当前留空状态。
 */
import { Bell } from "lucide-react";
import { requireCreator } from "@/lib/creator";
import { Card } from "@/components/ui/card";

export default async function NotificationsPage() {
  await requireCreator();
  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">通知</h1>
        <p className="text-sm text-muted-foreground mt-1">
          审核结果、活动节点和激励发放都会在这里出现。
        </p>
      </header>
      <Card className="border-dashed p-12 text-center">
        <Bell className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">暂无通知。</p>
      </Card>
    </div>
  );
}
