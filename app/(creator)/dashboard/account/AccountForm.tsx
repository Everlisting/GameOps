"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreatorAvatar } from "@/components/creator-avatar";
import { AVATAR_PRESETS, isAvatarPreset } from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

type Profile = {
  nickname: string;
  avatarUrl: string | null;
  groupNo: string | null;
  ysId: string | null;
  dyName: string | null;
  dyAccount: string | null;
  dyUrl: string | null;
};

const TEXT_FIELDS: {
  key: Exclude<keyof Profile, "avatarUrl">;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: "text" | "url";
}[] = [
  { key: "nickname", label: "昵称", placeholder: "展示昵称" },
  { key: "groupNo", label: "团号", placeholder: "组织内部编号" },
  { key: "ysId", label: "易闪 ID", placeholder: "YS123456" },
  { key: "dyName", label: "抖音昵称" },
  { key: "dyAccount", label: "抖音号" },
  { key: "dyUrl", label: "抖音主页链接", placeholder: "https://…", type: "url" },
];

export default function AccountForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/creators/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        return;
      }
      setOk(true);
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  const hasLegacyUrl =
    !!form.avatarUrl &&
    !isAvatarPreset(form.avatarUrl) &&
    /^https?:\/\//i.test(form.avatarUrl);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>头像</Label>
        <p className="text-[11px] text-muted-foreground">
          选择一个预设头像。
          {hasLegacyUrl && " 当前使用旧版链接头像,选择预设可替换。"}
        </p>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
          {AVATAR_PRESETS.map((p) => {
            const selected = form.avatarUrl === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-label={p.label}
                aria-pressed={selected}
                onClick={() => set("avatarUrl", p.key)}
                className={cn(
                  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full leading-none ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-105",
                  selected
                    ? "ring-primary"
                    : "ring-transparent hover:ring-border",
                )}
              >
                <CreatorAvatar
                  avatar={p.key}
                  name={p.label}
                  className="size-10"
                />
                {selected && (
                  <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                    <Check className="size-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {form.avatarUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => set("avatarUrl", null)}
          >
            清空头像
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`account-${f.key}`}>{f.label}</Label>
            <Input
              id={`account-${f.key}`}
              type={f.type ?? "text"}
              value={(form[f.key] ?? "") as string}
              placeholder={f.placeholder}
              onChange={(e) =>
                set(f.key, (e.target.value || null) as Profile[typeof f.key])
              }
            />
            {f.hint && (
              <p className="text-[11px] text-muted-foreground">{f.hint}</p>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">已保存。</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={submitting} size="lg">
          {submitting ? "保存中…" : "保存"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setForm(initial)}
          disabled={submitting}
          size="lg"
        >
          重置
        </Button>
      </div>
    </div>
  );
}
