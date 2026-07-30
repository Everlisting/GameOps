"use client";

/**
 * Job 创建 / 编辑表单。
 *
 * - mode="create" → POST /api/admin/jobs
 * - mode="edit"   → PATCH /api/admin/jobs/[id]
 *
 * 提交成功后跳列表(create)或留在当前页(edit)。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ParamSchemaEditor, { type ParamSchemaItem } from "./ParamSchemaEditor";
import OutputListEditor, { type OutputItem } from "./OutputListEditor";
import CronExpressionInput from "./CronExpressionInput";
import type { CsvTypeOption } from "@/lib/csv-types";
import type { RepositoryPreset } from "@/lib/job-repositories";

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

const MANUAL_REPOSITORY_VALUE = "__manual";

export default function JobForm({
  mode,
  initial,
  agents,
  csvTypes,
  repositoryPresets = [],
  onDirtyChange,
}: {
  mode: "create" | "edit";
  initial: JobFormInitial;
  agents: AgentOption[];
  csvTypes: CsvTypeOption[];
  repositoryPresets?: RepositoryPreset[];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<JobFormInitial>(initial);
  const [baseline, setBaseline] = useState<JobFormInitial>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [repositoryPresetId, setRepositoryPresetId] = useState(
    MANUAL_REPOSITORY_VALUE,
  );
  const dirty = JSON.stringify(data) !== JSON.stringify(baseline);
  const availableRepositoryPresets = repositoryPresets.filter(
    (preset) => preset.agentId === data.agentId,
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function set<K extends keyof JobFormInitial>(k: K, v: JobFormInitial[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function selectAgent(agentId: string) {
    set("agentId", agentId);
    setRepositoryPresetId(MANUAL_REPOSITORY_VALUE);
  }

  function selectRepositoryPreset(presetId: string) {
    setRepositoryPresetId(presetId);
    if (presetId === MANUAL_REPOSITORY_VALUE) return;

    const preset = repositoryPresets.find((item) => item.id === presetId);
    if (!preset) return;

    setData((current) => ({
      ...current,
      repoType: preset.repoType,
      repoUrl: preset.repoUrl,
      repoBranch: preset.repoBranch,
    }));
  }

  function setRepositoryField<K extends "repoType" | "repoUrl" | "repoBranch">(
    key: K,
    value: JobFormInitial[K],
  ) {
    setRepositoryPresetId(MANUAL_REPOSITORY_VALUE);
    set(key, value);
  }

  async function submit() {
    setError(null);
    setSaved(false);
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
        router.push(`/operator/tasks/${resp.id}`);
      } else {
        setBaseline(data);
        setSaved(true);
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
              onValueChange={selectAgent}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择一台爬虫机" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
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
                </SelectGroup>
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
          {mode === "create" ? (
            <Field className="col-span-12">
              <FieldLabel>复用已有仓库</FieldLabel>
              <Select
                value={data.agentId ? repositoryPresetId : undefined}
                onValueChange={selectRepositoryPreset}
                disabled={!data.agentId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请先选择爬虫机" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={MANUAL_REPOSITORY_VALUE}>
                      手动填写新仓库
                    </SelectItem>
                    {availableRepositoryPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.repoUrl}
                        {preset.repoBranch
                          ? ` · ${preset.repoBranch}`
                          : " · 默认分支"}
                        {` · ${preset.jobCount} 个 Job`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {!data.agentId
                  ? "先选择爬虫机，再选择该机器已经使用过的仓库。"
                  : availableRepositoryPresets.length > 0
                    ? "选择后自动回填仓库类型、地址和分支；不同爬虫只需填写各自的工作目录。"
                    : "这台爬虫机还没有仓库记录，本次手动填写后，后续 Job 可直接复用。"}
              </FieldDescription>
            </Field>
          ) : null}

          <div className="col-span-2">
            <Label className="mb-1.5 block text-xs">仓库类型</Label>
            <Select
              value={data.repoType}
              onValueChange={(v) =>
                setRepositoryField("repoType", v as "GIT" | "SVN")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="GIT">Git</SelectItem>
                  <SelectItem value="SVN">SVN</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-7">
            <Label className="mb-1.5 block text-xs">仓库地址 *</Label>
            <Input
              value={data.repoUrl}
              onChange={(e) => setRepositoryField("repoUrl", e.target.value)}
              placeholder="git@github.com:org/crawler.git"
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              同一爬虫机上,相同仓库地址只 clone 一次,多个 Job 共用并在运行前更新。
            </p>
          </div>
          <div className="col-span-3">
            <Label className="mb-1.5 block text-xs">分支(Git 用)</Label>
            <Input
              value={data.repoBranch}
              onChange={(e) =>
                setRepositoryField("repoBranch", e.target.value)
              }
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              整合仓库请填写具体爬虫子目录,命令和产物路径均以这里为起点。
            </p>
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
          触发任务时按这里生成表单,所有参数都会自动注入脚本环境变量。只有确实需要命令行参数时才写 {"{{参数名}}"}。
        </p>
        <ParamSchemaEditor
          value={data.paramSchema}
          onChange={(v) => set("paramSchema", v)}
        />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">产物清单</h2>
        <p className="text-xs text-muted-foreground">
          Agent 会上传所有匹配产物。选择 csvType 时解析入库;不选择时仅归档,仍可在数据集页下载。
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
        <Field orientation="horizontal">
          <Checkbox
            id="job-schedule-enabled"
            checked={data.enabled}
            onCheckedChange={(checked) => set("enabled", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="job-schedule-enabled">启用定时</FieldLabel>
            <FieldDescription>
              仅控制 cron 自动运行;关闭后仍可手动运行。
            </FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="job-active"
            checked={data.active}
            onCheckedChange={(checked) => set("active", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="job-active">启用采集任务</FieldLabel>
            <FieldDescription>
              整体开关;关闭后手动、重跑和定时都不可执行。
            </FieldDescription>
          </FieldContent>
        </Field>
      </Card>

      {saved && (
        <p className="text-right text-xs text-muted-foreground">
          已保存。现在可以运行当前版本。
        </p>
      )}

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
          {submitting
            ? "保存中…"
            : mode === "create"
              ? "创建并继续运行"
              : "保存修改"}
        </Button>
      </div>
    </div>
  );
}
