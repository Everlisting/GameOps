"use client";

/**
 * 新建运营 / 管理员账户。
 * 创建后默认状态 active,无需 pending 审核。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription, FieldGroup, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OperatorUserCreateForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("OPERATOR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "创建失败");
        return;
      }
      router.push(`/operator/admin/operators/${data.id}`);
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>新建账户</CardTitle>
        <CardDescription>用户名用于显示，账号名称用于登录。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cu-display-name">用户名 *</FieldLabel>
            <Input id="cu-display-name" value={displayName} maxLength={32}
              onChange={(e) => setDisplayName(e.target.value)} placeholder="例如：运营小王" autoComplete="off" />
            <FieldDescription>显示昵称，支持中文，1–32 个字符，本人可随时修改。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cu-username">账号名称 *</FieldLabel>
            <Input
              id="cu-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="字母 / 数字 / _ . -"
              minLength={3}
              maxLength={32}
              autoComplete="off"
            />
            <FieldDescription>3–32 个字符，创建后不可修改，作为登录唯一标识。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cu-role">
              角色 *
            </FieldLabel>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="cu-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="REVIEWER">审核</SelectItem>
                  <SelectItem value="OPERATOR">运营</SelectItem>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="cu-password">
              初始密码 *
            </FieldLabel>
            <Input
              id="cu-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 个字符以上"
              autoComplete="new-password"
            />
            <FieldDescription>
              建议告知本人后,立刻登录修改。
            </FieldDescription>
          </Field>
        </FieldGroup>

        {error && (
          <FieldError>{error}</FieldError>
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
          <Button onClick={submit} disabled={submitting || !username.trim() || !displayName.trim() || !password}>
            {submitting ? "创建中…" : "创建账户"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
