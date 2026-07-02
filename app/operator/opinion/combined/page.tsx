/**
 * 舆情监控 · 对比列表(OPERATOR+ 可见)。
 */
import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

import OpinionListPageShell from "../_components/OpinionListPageShell";
import { loadListPageData } from "../_components/loader";
import { clampPage, clampPageSize } from "../_components/paging";

export default async function OperatorOpinionCombinedPage({
  searchParams,
}: {
  searchParams?: { page?: string; pageSize?: string };
}) {
  await requireRole("OPERATOR");
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";

  const pageSize = clampPageSize(searchParams?.pageSize);
  const page = clampPage(searchParams?.page);
  const data = await loadListPageData("combined", {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return (
    <>
      {!data.serviceReachable && (
        <div className="px-8 pt-6">
          <Card className="border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>分析服务不可达,请检查 docker compose 状态与 env 配置。</span>
            </div>
          </Card>
        </div>
      )}
      <OpinionListPageShell
        scope="combined"
        initialItems={data.items}
        total={data.total}
        counts={data.counts}
        page={page}
        pageSize={pageSize}
        isAdmin={isAdmin}
        configured={data.configured}
        onRefreshHref="/operator/opinion/combined"
      />
    </>
  );
}
