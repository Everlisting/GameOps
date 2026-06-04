"use client";

/**
 * 手动触发 Job 一次,按 paramSchema 渲染参数表单。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import ParamForm from "./ParamForm";
import type { ParamSchemaItem } from "./ParamSchemaEditor";

export default function TriggerDialog({
  jobId,
  jobName,
  paramSchema,
  open,
  onOpenChange,
}: {
  jobId: string;
  jobName: string;
  paramSchema: ParamSchemaItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // 用 paramSchema 的 default 预填
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const p of paramSchema) {
      if (p.default !== undefined) init[p.name] = p.default;
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paramValues: values }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = data?.error?.details;
        let msg = data?.error?.message ?? "触发失败";
        if (Array.isArray(details)) {
          msg = details.map((d: { message: string }) => d.message).join(";");
        }
        setError(msg);
        return;
      }
      onOpenChange(false);
      // /operator/tasks/[id] 现在是 Job 详情(id = jobId),单次执行详情走 runs/[runId]
      router.push(`/operator/tasks/${data.jobId}/runs/${data.id}`);
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>触发 Job「{jobName}」</DialogTitle>
          <DialogDescription className="text-xs">
            填好参数后立即建一条 PENDING 任务,绑定 Agent 闲下来后自动跑。
          </DialogDescription>
        </DialogHeader>

        <div className="my-2">
          <ParamForm
            schema={paramSchema}
            values={values}
            onChange={setValues}
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "提交中…" : "触发"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
