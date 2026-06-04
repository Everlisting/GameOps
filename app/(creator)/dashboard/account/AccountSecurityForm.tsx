"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "idle" | "submitting" | "ok" | "error";

function Feedback({
  state,
  message,
  okText,
}: {
  state: Mode;
  message: string | null;
  okText: string;
}) {
  if (state === "error" && message)
    return <p className="text-sm text-destructive">{message}</p>;
  if (state === "ok")
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">{okText}</p>
    );
  return null;
}

export function EmailForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/account/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        setState("error");
        return;
      }
      setState("ok");
      router.refresh();
    } catch {
      setError("网络错误,请重试");
      setState("error");
    }
  }

  const submitting = state === "submitting";
  const unchanged = email.trim() === initialEmail.trim();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="account-email">邮箱</Label>
        <Input
          id="account-email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => {
            setEmail(e.target.value);
            if (state !== "idle") setState("idle");
          }}
        />
      </div>
      <Feedback state={state} message={error} okText="邮箱已更新。" />
      <Button
        type="button"
        onClick={submit}
        disabled={submitting || unchanged || !email.trim()}
        size="lg"
      >
        {submitting ? "保存中…" : "保存邮箱"}
      </Button>
    </div>
  );
}

export function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [state, setState] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        setState("error");
        return;
      }
      setState("ok");
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch {
      setError("网络错误,请重试");
      setState("error");
    }
  }

  const submitting = state === "submitting";
  const canSubmit =
    !submitting &&
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword.length >= 6;

  function onAnyChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      if (state !== "idle") setState("idle");
    };
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="account-current-password">当前密码</Label>
          <Input
            id="account-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={onAnyChange(setCurrent)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="account-new-password">新密码</Label>
          <Input
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={onAnyChange(setNew)}
          />
          <p className="text-[11px] text-muted-foreground">至少 6 个字符。</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="account-confirm-password">确认新密码</Label>
          <Input
            id="account-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={onAnyChange(setConfirm)}
          />
        </div>
      </div>
      <Feedback state={state} message={error} okText="密码已更新。" />
      <Button type="button" onClick={submit} disabled={!canSubmit} size="lg">
        {submitting ? "保存中…" : "修改密码"}
      </Button>
    </div>
  );
}
