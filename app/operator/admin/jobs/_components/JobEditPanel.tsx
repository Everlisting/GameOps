"use client";

/**
 * 编辑 Job 的整体面板:顶部一排操作按钮(触发/删除),下方表单。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import JobForm, { type JobFormInitial } from "./JobForm";
import TriggerDialog from "./TriggerDialog";
import type { CsvTypeOption } from "@/lib/csv-types";

type AgentOption = { id: string; name: string; status: "ACTIVE" | "DISABLED" };

export default function JobEditPanel({
  initial,
  agents,
  csvTypes,
}: {
  initial: JobFormInitial & { id: string };
  agents: AgentOption[];
  csvTypes: CsvTypeOption[];
}) {
  const router = useRouter();
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    if (!confirm(`确认删除 Job「${initial.name}」?未完成的任务会阻止删除。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/jobs/${initial.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error?.message ?? "删除失败");
        return;
      }
      router.push("/operator/admin/jobs");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setTriggerOpen(true)}>
          <Play className="size-4" />
          手动触发一次
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={del} disabled={deleting}>
          <Trash2 className="size-4" />
          删除 Job
        </Button>
      </div>

      <JobForm mode="edit" initial={initial} agents={agents} csvTypes={csvTypes} />

      <TriggerDialog
        jobId={initial.id}
        jobName={initial.name}
        paramSchema={initial.paramSchema}
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
      />
    </>
  );
}
