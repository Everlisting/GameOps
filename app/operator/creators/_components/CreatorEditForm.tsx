"use client";

/**
 * 创作者档案编辑(运营视角):昵称 / 等级 / 平台账号。
 * 头像 / 邮箱 / 密码 由创作者自助维护,运营不动。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CreatorEditInitial = {
  id: string;
  nickname: string;
  tier: string;
  groupNo: string;
  ysId: string;
  dyUid: string;
  dyName: string;
  dyAccount: string;
  dyUrl: string;
};

export default function CreatorEditForm({
  initial,
}: {
  initial: CreatorEditInitial;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function set<K extends keyof CreatorEditInitial>(
    k: K,
    v: CreatorEditInitial[K],
  ) {
    setS((cur) => ({ ...cur, [k]: v }));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/operator/creators/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: s.nickname,
          tier: s.tier || null,
          groupNo: s.groupNo || null,
          ysId: s.ysId || null,
          dyUid: s.dyUid || null,
          dyName: s.dyName || null,
          dyAccount: s.dyAccount || null,
          dyUrl: s.dyUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-medium">档案信息</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="昵称 *">
          <Input
            value={s.nickname}
            maxLength={32}
            onChange={(e) => set("nickname", e.target.value)}
          />
        </Field>
        <Field label="等级 / 分级">
          <Input
            value={s.tier}
            maxLength={32}
            placeholder="例:S / A / B"
            onChange={(e) => set("tier", e.target.value)}
          />
        </Field>

        <Field label="团号">
          <Input
            value={s.groupNo}
            maxLength={64}
            placeholder="组织内部编号"
            onChange={(e) => set("groupNo", e.target.value)}
          />
        </Field>
        <Field label="易闪 ID">
          <Input
            value={s.ysId}
            maxLength={64}
            onChange={(e) => set("ysId", e.target.value)}
          />
        </Field>
        <Field label="抖音 UID">
          <Input
            value={s.dyUid}
            maxLength={64}
            onChange={(e) => set("dyUid", e.target.value)}
          />
        </Field>

        <Field label="抖音昵称">
          <Input
            value={s.dyName}
            maxLength={64}
            onChange={(e) => set("dyName", e.target.value)}
          />
        </Field>
        <Field label="抖音号">
          <Input
            value={s.dyAccount}
            maxLength={64}
            onChange={(e) => set("dyAccount", e.target.value)}
          />
        </Field>

        <Field label="抖音主页链接" className="md:col-span-2">
          <Input
            value={s.dyUrl}
            type="url"
            placeholder="https://..."
            onChange={(e) => set("dyUrl", e.target.value)}
          />
        </Field>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          {savedAt && Date.now() - savedAt < 4000 ? "已保存" : ""}
        </span>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "保存中…" : "保存档案"}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
