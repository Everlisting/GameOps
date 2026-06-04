/**
 * 运营端 · 活动管理 · 新建
 * 默认时间:开始 = 今天 09:00,结束 = 7 天后 23:59。
 */
import { requireRole } from "@/lib/rbac";
import ActivityForm from "../_components/ActivityForm";

function fmtLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function NewActivityPage() {
  await requireRole("OPERATOR");

  const now = new Date();
  const start = new Date(now);
  start.setHours(9, 0, 0, 0);
  const end = new Date(now.getTime() + 7 * 24 * 3600_000);
  end.setHours(23, 59, 0, 0);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">新建活动</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          新活动默认为草稿状态。激励规则可后续在详情页继续编辑。
        </p>
      </header>
      <ActivityForm
        mode="create"
        initial={{
          name: "",
          description: "",
          coverImage: "",
          startAt: fmtLocal(start),
          endAt: fmtLocal(end),
          rewardRules: [],
        }}
      />
    </div>
  );
}
