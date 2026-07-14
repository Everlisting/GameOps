"use client";

/**
 * Job 创建 / 编辑表单。
 *
 * - mode="create" → POST /api/admin/jobs
 * - mode="edit"   → PATCH /api/admin/jobs/[id]
 *
 * 提交成功后跳列表(create)或留在当前页(edit)。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ParamSchemaEditor, { type ParamSchemaItem } from "./ParamSchemaEditor";
import OutputListEditor, { type OutputItem } from "./OutputListEditor";
import CronExpressionInput from "./CronExpressionInput";
import type { CsvTypeOption } from "@/lib/csv-types";

type AgentOption = { id: string; name: string; status: "ACTIVE" | "DISABLED" };

export type JobFormInitial = {
  id?: string;
  name: string;
  description: string;
  agentId: string;
  repoType: "GIT" | "SVN";
  repoUrl: string;
  repoBranch: string;
  workdir: string;
  command: string;
  timeoutMinutes: number;
  paramSchema: ParamSchemaItem[];
  outputs: OutputItem[];
  cronExpression: string;
  enabled: boolean;
  active: boolean;
};

export const EMPTY_INITIAL: JobFormInitial = {
  name: "",
  description: "",
  agentId: "",
  repoType: "GIT",
  repoUrl: "",
  repoBranch: "main",
  workdir: ".",
  command: "",
  timeoutMinutes: 30,
  paramSchema: [],
  outputs: [],
  cronExpression: "",
  enabled: true,
  active: true,
};

export default function JobForm({
  mode,
  initial,
  agents,
  csvTypes,
}: {
  mode: "create" | "edit";
  initial: JobFormInitial;
  agents: AgentOption[];
  csvTypes: CsvTypeOption[];
}) {
  const router = useRouter();
  const [data, setData] = useState<JobFormInitial>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof JobFormInitial>(k: K, v: JobFormInitial[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        agentId: data.agentId,
        repoType: data.repoType,
        repoUrl: data.repoUrl.trim(),
        repoBranch: data.repoBranch.trim() || undefined,
        workdir: data.workdir.trim() || ".",
        command: data.command,
        timeoutMinutes: data.timeoutMinutes,
        paramSchema: data.paramSchema,
        outputs: data.outputs,
        cronExpression: data.cronExpression.trim() || null,
        enabled: data.enabled,
        active: data.active,
      };
      const url =
        mode === "create"
          ? "/api/admin/jobs"
          : `/api/admin/jobs/${initial.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resp = await res.json();
      if (!res.ok) {
        const details = resp?.error?.details;
        let msg = resp?.error?.message ?? "保存失败";
        if (Array.isArray(details)) {
          msg = details.map((d: { path: string; message: string }) => d.message).join(";");
        } else if (details && typeof details === "object") {
          msg = Object.values(details).flat().filter(Boolean).join(";") || msg;
        }
        setError(msg);
        return;
      }
      if (mode === "create") {
        router.push("/operator/admin/jobs");
      } else {
        router.refresh();
      }
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">基础信息</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block text-xs">Job 名称 *</Label>
            <Input
              value={data.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="抖音视频明细 · 日抓"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">绑定爬虫机 *</Label>
            <Select
              value={data.agentId || undefined}
              onValueChange={(v) => set("agentId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择一台爬虫机" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem
                    key={a.id}
                    value={a.id}
                    disabled={a.status === "DISABLED"}
                  >
                    {a.name}
                    {a.status === "DISABLED" ? " (已停用)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="mb-1.5 block text-xs">描述</Label>
            <Textarea
              value={data.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="给运营 / 管理员看,简述这个 Job 干什么"
              rows={2}
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">代码 & 执行</h2>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-2">
            <Label className="mb-1.5 block text-xs">仓库类型</Label>
            <Select
              value={data.repoType}
              onValueChange={(v) => set("repoType", v as "GIT" | "SVN")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GIT">Git</SelectItem>
                <SelectItem value="SVN">SVN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-7">
            <Label className="mb-1.5 block text-xs">仓库地址 *</Label>
            <Input
              value={data.repoUrl}
              onChange={(e) => set("repoUrl", e.target.value)}
              placeholder="git@github.com:org/crawler.git"
              className="font-mono text-xs"
            />
          </div>
          <div className="col-span-3">
            <Label className="mb-1.5 block text-xs">分支(Git 用)</Label>
            <Input
              value={data.repoBranch}
              onChange={(e) => set("repoBranch", e.target.value)}
              placeholder="main"
              className="font-mono text-xs"
            />
          </div>
          <div className="col-span-9">
            <Label className="mb-1.5 block text-xs">工作目录(相对仓库根)</Label>
            <Input
              value={data.workdir}
              onChange={(e) => set("workdir", e.target.value)}
              placeholder="scripts/douyin"
              className="font-mono text-xs"
            />
          </div>
          <div className="col-span-3">
            <Label className="mb-1.5 block text-xs">超时(分钟)*</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={data.timeoutMinutes}
              onChange={(e) => set("timeoutMinutes", Number(e.target.value) || 30)}
            />
          </div>
          <div className="col-span-12">
            <Label className="mb-1.5 block text-xs">
              命令模板 *(用 {"{{paramName}}"} 引用参数)
            </Label>
            <Textarea
              value={data.command}
              onChange={(e) => set("command", e.target.value)}
              placeholder="python run.py --start={{startDate}} --end={{endDate}}"
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">参数定义</h2>
        <p className="text-xs text-muted-foreground">
          触发任务时,UI 会按这里的类型生成表单(日期 / 文本 / 数值 / 枚举)。
        </p>
        <ParamSchemaEditor
          value={data.paramSchema}
          onChange={(v) => set("paramSchema", v)}
        />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">产物清单</h2>
        <p className="text-xs text-muted-foreground">
          脚本跑完后,agent 按这里捡产物。带 csvType 的会被上传到中台入库;不带的留在爬虫机本地(由脚本自己处理,如发飞书)。
        </p>
        <OutputListEditor
          value={data.outputs}
          onChange={(v) => set("outputs", v)}
          csvTypes={csvTypes}
        />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">调度</h2>
        <div>
          <Label className="mb-1.5 block text-xs">Cron 表达式(可选)</Label>
          <CronExpressionInput
            value={data.cronExpression}
            onChange={(v) => set("cronExpression", v)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          定时启用(仅控 cron 自动触发;关掉后不定时跑,手动触发仍可)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          任务启用(整体开关;停用后任何方式都不可触发,含手动 / rerun)
        </label>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          取消
        </Button>
        <Button onClick={submit} disabled={submitting || !data.name || !data.agentId}>
          {submitting ? "保存中…" : mode === "create" ? "创建 Job" : "保存修改"}
        </Button>
      </div>
    </div>
  );
}
