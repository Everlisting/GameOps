"use client";

/**
 * 运营端 · 活动表单(创建 / 编辑共用)
 * - 基础字段(名称/描述/封面/起止)+ 激励规则编辑器
 * - 编辑权限按 status 区分:
 *     DRAFT   :全可改 + 「定时发布」卡
 *     ONGOING :默认锁定,右上角按钮触发二级确认弹窗后解锁
 *     ENDED   :永久只读,无解锁按钮
 * - 提交后:create → /operator/activities/[id];edit → router.refresh()
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityStatus } from "@prisma/client";
import {
  CalendarClock,
  ImagePlus,
  Lock,
  LockOpen,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DateTimePickerField from "@/app/operator/_components/DateTimePickerField";
import { cn } from "@/lib/utils";
import type { RewardRule } from "@/lib/validation/activity";
import RewardRulesEditor from "./RewardRulesEditor";

export type ActivityFormInitial = {
  id?: string;
  name: string;
  description: string;
  coverImage: string;
  /** datetime-local 期望:YYYY-MM-DDTHH:mm */
  startAt: string;
  endAt: string;
  /** 草稿定时发布;YYYY-MM-DDTHH:mm,空 = 未设置 */
  publishAt?: string;
  rewardRules: RewardRule[];
};

export default function ActivityForm({
  initial,
  mode,
  status,
}: {
  initial: ActivityFormInitial;
  mode: "create" | "edit";
  /** 编辑模式下必须传入,新建模式 undefined */
  status?: ActivityStatus;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [startAt, setStartAt] = useState(initial.startAt);
  const [endAt, setEndAt] = useState(initial.endAt);
  const [publishAt, setPublishAt] = useState(initial.publishAt ?? "");
  const [rules, setRules] = useState<RewardRule[]>(initial.rewardRules);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDraftEdit = mode === "edit" && status === "DRAFT";
  const readonly = mode === "edit" && status === "ENDED";
  const needsUnlock = mode === "edit" && status === "ONGOING";
  const [unlocked, setUnlocked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 是否允许编辑「基础信息 + 激励规则」
  const canEdit = !readonly && (!needsUnlock || unlocked);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name,
        description: description || null,
        coverImage: coverImage || null,
        startAt,
        endAt,
        rewardRules: rules,
      };
      if (isDraftEdit) body.publishAt = publishAt || null;

      const url =
        mode === "create"
          ? "/api/operator/activities"
          : `/api/operator/activities/${initial.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        return;
      }
      if (mode === "create") {
        router.push(`/operator/activities/${data.id}`);
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
    // 用 flex+gap-8 替代 space-y-8:fieldset 节点和 space-y 的相邻选择器有时不吃,
    // gap 走 flex 直接计算,不依赖 :not([hidden]) ~ :not([hidden]) 的链式选择。
    <div className="flex flex-col gap-8">
      {(readonly || needsUnlock) && (
        <LockBanner
          status={status!}
          unlocked={unlocked}
          onRequestUnlock={() => setConfirmOpen(true)}
          onRelock={() => setUnlocked(false)}
        />
      )}

      {/* fieldset disabled 把内部所有原生表单控件(包括 radix Select 触发器)统一锁掉 */}
      <fieldset
        disabled={!canEdit}
        className={cn(
          "m-0 flex flex-col gap-6 border-0 p-0",
          !canEdit && "opacity-70",
        )}
      >
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-medium">基础信息</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="act-name" className="mb-1.5 block text-xs">
                活动名称 *
              </Label>
              <Input
                id="act-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="例:新作首发激励 · 2026年5月"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="act-desc" className="mb-1.5 block text-xs">
                活动描述
              </Label>
              <Textarea
                id="act-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="对创作者展示的说明,支持普通文本。"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1.5 block text-xs">封面图</Label>
              <CoverImageUploader
                value={coverImage}
                onChange={setCoverImage}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="act-start" className="mb-1.5 block text-xs">
                开始时间 *
              </Label>
              <DateTimePickerField
                id="act-start"
                value={startAt}
                onChange={setStartAt}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="act-end" className="mb-1.5 block text-xs">
                结束时间 *
              </Label>
              <DateTimePickerField
                id="act-end"
                value={endAt}
                onChange={setEndAt}
                disabled={!canEdit}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-medium">激励规则</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              七类规则可叠加(最多 10 条)。阶段3 仅做配置存储,实际预估金额由阶段5
              激励引擎读取计算。
            </p>
          </div>
          <RewardRulesEditor value={rules} onChange={setRules} />
        </Card>
      </fieldset>

      {isDraftEdit && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">定时发布</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            设置后到点会把活动自动切换到「进行中」。空值 = 不定时,需要手动点上线。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[260px] flex-1">
              <DateTimePickerField
                id="act-publish"
                value={publishAt}
                onChange={setPublishAt}
              />
            </div>
            {publishAt && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPublishAt("")}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                清除
              </Button>
            )}
          </div>
        </Card>
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
          {readonly ? "返回" : "取消"}
        </Button>
        {!readonly && (
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || (needsUnlock && !unlocked)}
          >
            {submitting ? "保存中…" : mode === "create" ? "创建草稿" : "保存"}
          </Button>
        )}
      </div>

      {/* 二级确认弹窗 — 仅 ONGOING 进入解锁流程时使用 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解锁编辑</AlertDialogTitle>
            <AlertDialogDescription>
              活动正在进行中,编辑功能已锁定,请确认是否进行修改?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnlocked(true);
                setConfirmOpen(false);
              }}
            >
              确认解锁
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LockBanner({
  status,
  unlocked,
  onRequestUnlock,
  onRelock,
}: {
  status: ActivityStatus;
  unlocked: boolean;
  onRequestUnlock: () => void;
  onRelock: () => void;
}) {
  if (status === "ENDED") {
    return (
      <div className="flex items-center justify-end gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        <Lock className="size-3.5" />
        活动已结束,基础信息与激励规则均不可编辑
      </div>
    );
  }
  // ONGOING
  return (
    <div className="flex items-center justify-end gap-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
      {unlocked ? (
        <>
          <LockOpen className="size-3.5" />
          <span>编辑已解锁,请谨慎修改进行中活动</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRelock}
            className="h-7"
          >
            重新锁定
          </Button>
        </>
      ) : (
        <>
          <Lock className="size-3.5" />
          <span>活动正在进行中,编辑功能已锁定</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRequestUnlock}
            className="h-7"
          >
            点击解锁
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * 封面图上传:点击选文件 → POST 到 /api/operator/uploads/activity-cover →
 * 拿到返回的站内路径,塞回外部 value。后端会校验类型/大小,前端只做粗筛 + 显示。
 */
function CoverImageUploader({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockOut = disabled || uploading;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许同名文件再次选择
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("仅支持图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("图片不能超过 5 MB");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/operator/uploads/activity-cover", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "上传失败");
        return;
      }
      onChange(data.url as string);
    } catch {
      setError("网络错误,请重试");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onPick}
      />
      {value ? (
        <div className="flex items-start gap-3">
          <div className="relative aspect-video w-56 overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="封面预览"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={lockOut}
            >
              <Upload className="size-3.5" />
              {uploading ? "上传中…" : "更换封面"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
              disabled={lockOut}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              移除
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={lockOut}
          className="flex aspect-video w-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ImagePlus className="size-6" />
          {uploading ? "上传中…" : "点击上传封面图"}
        </button>
      )}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          支持 PNG / JPG / WebP / GIF,最大 5 MB。建议比例 16:9。
        </p>
      )}
    </div>
  );
}
