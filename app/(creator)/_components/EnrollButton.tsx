"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function EnrollButton({
  activityId,
  enrolled,
  disabled,
}: {
  activityId: string;
  enrolled: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (enrolled) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5">
        <BadgeCheck className="size-3.5" />
        已报名
      </Button>
    );
  }

  async function enroll() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/enroll`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "报名失败");
        return;
      }
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={enroll} disabled={loading || disabled} size="sm">
        {loading ? "处理中…" : "报名活动"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
