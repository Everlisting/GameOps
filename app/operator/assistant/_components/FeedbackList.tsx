"use client";

/**
 * AI 助手 · 反馈列表(运营可见)。展示创作者/运营提交的反馈:用户、角色、评分、文字、时间。
 */
import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

interface FB {
  id: string;
  rating: string | null;
  note: string | null;
  conversationId: string | null;
  createdAt: string;
  username: string;
  role: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  CREATOR: "创作者",
  OPERATOR: "运营",
  ADMIN: "管理员",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function FeedbackList() {
  const [items, setItems] = useState<FB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/operator/assistant/feedback");
        if (res.ok) {
          const d = (await res.json()) as { feedback?: FB[] };
          setItems(d.feedback ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">暂无反馈。</p>;

  return (
    <div className="space-y-2">
      {items.map((f) => (
        <div key={f.id} className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{f.username}</span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {f.role ? (ROLE_LABEL[f.role] ?? f.role) : "—"}
            </span>
            {f.rating === "up" && <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />}
            {f.rating === "down" && <ThumbsDown className="h-3.5 w-3.5 text-red-600" />}
            <span className="ml-auto">{fmt(f.createdAt)}</span>
          </div>
          {f.note ? (
            <p className="whitespace-pre-wrap text-sm">{f.note}</p>
          ) : (
            <p className="text-sm text-muted-foreground">(仅评分,无文字)</p>
          )}
        </div>
      ))}
    </div>
  );
}
