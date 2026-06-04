/**
 * 管理员 · 新建 Job
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { listCsvTypes } from "@/lib/csv-types";

import JobForm, { EMPTY_INITIAL } from "../_components/JobForm";

export default async function NewJobPage() {
  await requireRole("ADMIN");

  const [agents, csvTypes] = await Promise.all([
    prisma.crawlerAgent.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    }),
    listCsvTypes(),
  ]);

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/admin/jobs"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回 Job 列表
        </Link>
      </div>
      <header className="mb-6">
        <h1 className="text-lg font-semibold">新建 Job</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          配好后 ADMIN 可手动触发,有 cron 时还会到点自动跑。
        </p>
      </header>
      <JobForm
        mode="create"
        initial={EMPTY_INITIAL}
        agents={agents}
        csvTypes={csvTypes}
      />
    </div>
  );
}
