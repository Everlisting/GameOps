"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

/**
 * 管理员在列表行内的重跑 / 删除按钮。
 *
 * RUNNING / PENDING 状态下:重跑禁,删除仅在非 RUNNING 时可用(RUNNING 分析服务会 409)。
 * 触发后回调 onChanged 让父列表刷新。
 */
export function OpinionActions({
  taskId,
  status,
  onChanged,
}: {
  taskId: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  onChanged: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<null | "rerun" | "delete">(null);
  const [err, setErr] = useState<string | null>(null);

  async function rerun() {
    setBusy("rerun");
    setErr(null);
    try {
      const res = await fetch(`/api/opinion/tasks/${taskId}/rerun`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b?.error?.message ?? `重跑失败(${res.status})`);
        return;
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    setBusy("delete");
    setErr(null);
    try {
      const res = await fetch(`/api/opinion/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const b = await res.json().catch(() => ({}));
        setErr(b?.error?.message ?? `删除失败(${res.status})`);
        return;
      }
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(null);
    }
  }

  const rerunDisabled = busy !== null || status === "PENDING" || status === "RUNNING";
  const deleteDisabled = busy !== null || status === "RUNNING";

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={rerun}
        disabled={rerunDisabled}
        title={
          status === "RUNNING" || status === "PENDING"
            ? "任务未结束,不能重跑"
            : "用相同输入重跑"
        }
      >
        <RotateCcw className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirmDelete(true)}
        disabled={deleteDisabled}
        className="text-destructive hover:text-destructive"
        title={status === "RUNNING" ? "运行中不能删除" : "删除任务和产物"}
      >
        <Trash2 className="size-3.5" />
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该报告?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">taskId: <code className="font-mono">{taskId}</code></span>
              <span className="mt-2 block">
                会同时删掉分析服务侧的原始输入、HTML/JSON,
                以及中台 storage 里的缓存。此操作不可撤销。
              </span>
              {err && (
                <span className="mt-2 block rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {err}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void del();
              }}
              disabled={busy === "delete"}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busy === "delete" ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {err && !confirmDelete && (
        <span className="ml-2 text-[10px] text-destructive">{err}</span>
      )}
    </>
  );
}
