/**
 * 管理员 · 编辑 Job + 触发执行入口
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { listCsvTypes } from "@/lib/csv-types";

import JobEditPanel from "../_components/JobEditPanel";
import type { ParamSchemaItem } from "../_components/ParamSchemaEditor";
import type { OutputItem } from "../_components/OutputListEditor";

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("ADMIN");

  const job = await prisma.crawlerJob.findUnique({
    where: { id: params.id },
    include: {
      agent: { select: { id: true, name: true, status: true } },
      _count: { select: { tasks: true } },
    },
  });
  if (!job) nextNotFound();

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
        <h1 className="text-lg font-semibold">{job.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          创建于 {fmtDateTime(job.createdAt)} · 共执行 {job._count.tasks} 次
        </p>
      </header>

      <JobEditPanel
        agents={agents}
        csvTypes={csvTypes}
        initial={{
          id: job.id,
          name: job.name,
          description: job.description ?? "",
          agentId: job.agentId,
          repoType: job.repoType,
          repoUrl: job.repoUrl,
          repoBranch: job.repoBranch ?? "",
          workdir: job.workdir,
          command: job.command,
          timeoutMinutes: job.timeoutMinutes,
          paramSchema: (job.paramSchema as unknown as ParamSchemaItem[]) ?? [],
          outputs: (job.outputs as unknown as OutputItem[]) ?? [],
          cronExpression: job.cronExpression ?? "",
          enabled: job.enabled,
          active: job.active,
        }}
      />
    </div>
  );
}
