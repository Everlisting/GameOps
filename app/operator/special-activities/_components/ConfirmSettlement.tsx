"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ConfirmSettlement({ id, fingerprint, totalCents, disabled }: {
  id: string; fingerprint: string; totalCents: number; disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/special-activities/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: { message?: string } };
        throw new Error(data.error?.message ?? "确认失败，请刷新后重试");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setError(""); } }}>
    <DialogTrigger asChild><Button disabled={disabled}>确认结算</Button></DialogTrigger>
    <DialogContent className="max-w-[calc(100%-2rem)] shadow-none sm:max-w-lg">
      <DialogHeader><DialogTitle>确认并冻结结算</DialogTitle><DialogDescription>本次税前合计 ¥{(totalCents / 100).toFixed(2)}。确认后保存规则、稿件数据和金额，后续采集更新不影响结果。</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" disabled={busy}>取消</Button></DialogClose>
        {error && <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); router.refresh(); }}>刷新预估</Button>}
        <Button disabled={busy || !!error} onClick={() => void confirm()}>{busy ? "确认中…" : "确认冻结"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
