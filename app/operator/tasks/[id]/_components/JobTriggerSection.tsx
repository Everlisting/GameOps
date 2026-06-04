"use client";

/**
 * Job 详情页右上的"立即触发"卡片内容。
 * 默认值取 paramSchema.default。点"运行"POST /api/admin/jobs/[id]/trigger,
 * 成功后跳到新建出来的 run 详情(/operator/tasks/[jobId]/runs/[runId])。
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import ParamForm from "@/app/operator/admin/jobs/_components/ParamForm";
import type { ParamSchemaItem } from "@/app/operator/admin/jobs/_components/ParamSchemaEditor";

export default function JobTriggerSection({
  jobId,
  paramSchema,
}: {
  jobId: string;
  paramSchema: ParamSchemaItem[];
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const p of paramSchema) {
      if (p.default !== undefined) init[p.name] = p.default;
    }
    return init;
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onRun() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paramValues: values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `触发失败 (HTTP ${res.status})`);
      }
      // 跳到新 run 详情
      router.push(`/operator/tasks/${jobId}/runs/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <ParamForm schema={paramSchema} values={values} onChange={setValues} />
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
      <Button onClick={onRun} disabled={submitting} className="w-full">
        <Play className="size-3.5" />
        {submitting ? "提交中…" : "运行"}
      </Button>
    </div>
  );
}
