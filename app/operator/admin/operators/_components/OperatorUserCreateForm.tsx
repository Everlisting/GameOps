"use client";

/**
 * 新建运营 / 管理员账户。
 * 创建后默认状态 active,无需 pending 审核。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OperatorUserCreateForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
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
        body: JSON.stringify({ username, password, role }),
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
    <Card className="space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="cu-username" className="mb-1.5 block text-xs">
            用户名 *
          </Label>
          <Input
            id="cu-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="字母 / 数字 / _ . -"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            创建后不可修改,作为登录唯一标识。
          </p>
        </div>
        <div>
          <Label htmlFor="cu-role" className="mb-1.5 block text-xs">
            角色 *
          </Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="cu-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPERATOR">运营</SelectItem>
              <SelectItem value="ADMIN">管理员</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="cu-password" className="mb-1.5 block text-xs">
            初始密码 *
          </Label>
          <Input
            id="cu-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 个字符以上"
            autoComplete="new-password"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            建议告知本人后,立刻登录修改。
          </p>
        </div>
      </div>

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
        <Button onClick={submit} disabled={submitting || !username || !password}>
          {submitting ? "创建中…" : "创建账户"}
        </Button>
      </div>
    </Card>
  );
}
