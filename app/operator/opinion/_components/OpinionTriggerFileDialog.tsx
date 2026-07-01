"use client";

/**
 * 私域 / 公域触发对话框:选文件 + 填 game + 可选 coverageSpan → POST 触发。
 *
 * 私域接受 .json/.csv/.tsv/.xlsx/.xls;公域只接受 .json。
 * 50MB 上限在前端先卡一次,后端还会再兜一次。
 */
import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";

const MAX_SIZE = 50 * 1024 * 1024;

const PRIVATE_ACCEPT = ".json,.csv,.tsv,.xlsx,.xls";
const PUBLIC_ACCEPT = ".json";

export function OpinionTriggerFileDialog({
  scope,
  configured,
  onCreated,
}: {
  scope: "private" | "public";
  configured: boolean; // LLM 是否已配置
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [game, setGame] = useState("率土之滨");
  const [spanFrom, setSpanFrom] = useState("");
  const [spanTo, setSpanTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setGame("率土之滨");
    setSpanFrom("");
    setSpanTo("");
    setErr(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // 拼成分析服务约定的 "YYYY-MM-DD ~ YYYY-MM-DD";只填一头不合法,两头都空表示不指定
  function buildCoverageSpan(): string | null {
    if (!spanFrom && !spanTo) return null;
    if (!spanFrom || !spanTo) return "INVALID";
    if (spanFrom > spanTo) return "INVALID";
    return `${spanFrom} ~ ${spanTo}`;
  }

  async function submit() {
    if (!file) {
      setErr("请选择输入文件");
      return;
    }
    if (file.size > MAX_SIZE) {
      setErr(`文件超过 50MB 上限(实际 ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    const span = buildCoverageSpan();
    if (span === "INVALID") {
      setErr("数据周期需要同时选起止日期,且起 ≤ 止");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("game", game.trim() || "率土之滨");
      if (span) form.append("coverageSpan", span);

      const res = await fetch(`/api/opinion/tasks/${scope}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b?.error?.message ?? `触发失败(${res.status})`);
        return;
      }
      setOpen(false);
      reset();
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  const scopeLabel = scope === "private" ? "私域" : "公域";
  const inputHint =
    scope === "private"
      ? ".json / .csv / .tsv / .xlsx / .xls — 聊天记录导出文件"
      : ".json — scripts/merge_platforms.py 产出的三平台合并文件";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button
        onClick={() => setOpen(true)}
        disabled={!configured}
        title={configured ? undefined : "请先在「模型设置」里配置 LLM"}
      >
        <UploadCloud className="size-4" />
        生成新报告
      </Button>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>生成{scopeLabel}舆情报告</DialogTitle>
          <DialogDescription>
            上传数据,后台会异步跑分析并落 HTML 报告(几十秒到几分钟)。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="opn-file" className="mb-1.5 block text-xs">
              输入文件 *
            </Label>
            <Input
              id="opn-file"
              ref={fileInputRef}
              type="file"
              accept={scope === "private" ? PRIVATE_ACCEPT : PUBLIC_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{inputHint}</p>
            {file && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="opn-game" className="mb-1.5 block text-xs">
              游戏
            </Label>
            <Input
              id="opn-game"
              value={game}
              onChange={(e) => setGame(e.target.value)}
              disabled={submitting}
              placeholder="率土之滨"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">数据周期(可选)</Label>
            <div className="flex items-end gap-2">
              <DatePickerField
                id="opn-span-from"
                label="起"
                value={spanFrom}
                onChange={setSpanFrom}
              />
              <span className="pb-2 text-sm text-muted-foreground">~</span>
              <DatePickerField
                id="opn-span-to"
                label="止"
                value={spanTo}
                onChange={setSpanTo}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              留空则从消息时间戳推断。
            </p>
          </div>

          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={submitting || !file}>
            {submitting ? "上传中…" : "开始生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
