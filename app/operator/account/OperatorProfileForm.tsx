"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { operatorProfileUpdateSchema } from "@/lib/validation/operator-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const apiErrorSchema = z.object({ error: z.object({ message: z.string() }) });

export default function OperatorProfileForm({
  accountName, initialDisplayName,
}: { accountName: string; initialDisplayName: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedDisplayName, setSavedDisplayName] = useState(initialDisplayName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const parsed = operatorProfileUpdateSchema.safeParse({ displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/operator/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data: unknown = await res.json();
        const apiError = apiErrorSchema.safeParse(data);
        setError(apiError.success ? apiError.data.error.message : "保存失败，请重试");
        return;
      }
      setDisplayName(parsed.data.displayName);
      setSavedDisplayName(parsed.data.displayName);
      setSaved(true);
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="profile-account">账号名称</FieldLabel>
          <Input id="profile-account" value={accountName} readOnly />
          <FieldDescription>用于登录的唯一标识，创建后不可修改。</FieldDescription>
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="profile-name">用户名</FieldLabel>
          <Input id="profile-name" value={displayName} maxLength={32} required
            autoComplete="nickname" aria-invalid={!!error} disabled={submitting}
            onChange={(event) => { setDisplayName(event.target.value); setSaved(false); setError(""); }} />
          <FieldDescription>用于显示的昵称，支持中文，1–32 个字符，可以随时修改。</FieldDescription>
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
      <div className="flex items-center justify-end gap-3">
        <span role="status" className="text-sm text-muted-foreground">{saved ? "用户名已保存" : ""}</span>
        <Button type="submit" disabled={submitting || !displayName.trim() || displayName.trim() === savedDisplayName}>
          {submitting ? "保存中…" : "保存用户名"}
        </Button>
      </div>
    </form>
  );
}
