"use client";

/**
 * 编辑运营 / 管理员账户:角色 / 状态 / 重置密码 / 删除。
 * 自伤防护:isSelf 时禁用角色/状态/删除,仅允许「去账户设置改自己密码」。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { Trash2 } from "lucide-react";

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

export type EditInitial = {
  id: string;
  username: string;
  role: Role;
  status: "pending" | "active" | "disabled";
};

export default function OperatorUserEditForm({
  initial,
  isSelf,
}: {
  initial: EditInitial;
  isSelf: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RoleStatusCard initial={initial} isSelf={isSelf} />
      <PasswordResetCard initial={initial} isSelf={isSelf} />
      <DangerCard initial={initial} isSelf={isSelf} />
    </div>
  );
}

function RoleStatusCard({
  initial,
  isSelf,
}: {
  initial: EditInitial;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initial.role);
  const [status, setStatus] = useState<EditInitial["status"]>(initial.status);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = role !== initial.role || status !== initial.status;

  async function save() {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      if (role !== initial.role) body.role = role;
      if (status !== initial.status) body.status = status;
      const res = await fetch(`/api/admin/operators/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "保存失败");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-medium">角色与状态</h2>
      {isSelf && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          不能修改自己的角色或状态(避免锁死自己)。
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="eu-role" className="mb-1.5 block text-xs">
            角色
          </Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            disabled={isSelf}
          >
            <SelectTrigger id="eu-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPERATOR">运营</SelectItem>
              <SelectItem value="ADMIN">管理员</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="eu-status" className="mb-1.5 block text-xs">
            状态
          </Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as EditInitial["status"])}
            disabled={isSelf}
          >
            <SelectTrigger id="eu-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">已启用</SelectItem>
              <SelectItem value="disabled">已停用</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
        <Button onClick={save} disabled={isSelf || submitting || !dirty}>
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </Card>
  );
}

function PasswordResetCard({
  initial,
  isSelf,
}: {
  initial: EditInitial;
  isSelf: boolean;
}) {
  const [pw, setPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/operators/${initial.id}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: pw }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "重置失败");
        return;
      }
      setPw("");
      setSavedAt(Date.now());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-medium">重置密码</h2>
      {isSelf ? (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          自己的密码请到{" "}
          <Link
            href="/operator/account"
            className="text-primary underline-offset-4 hover:underline"
          >
            账户设置
          </Link>{" "}
          修改(需要旧密码确认)。此处仅用于代他人重置。
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          直接覆盖密码,不需要旧密码。请告知 {initial.username} 后立刻让其修改。
        </p>
      )}
      <div>
        <Label className="mb-1.5 block text-xs">新密码</Label>
        <Input
          type="text"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="6 个字符以上"
          disabled={isSelf}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          {savedAt && Date.now() - savedAt < 4000 ? "已重置" : ""}
        </span>
        <Button onClick={save} disabled={isSelf || submitting || pw.length < 6}>
          {submitting ? "重置中…" : "重置密码"}
        </Button>
      </div>
    </Card>
  );
}

function DangerCard({
  initial,
  isSelf,
}: {
  initial: EditInitial;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function destroy() {
    if (
      !confirm(
        `确认删除账户 ${initial.username}?此操作不可恢复。如只是临时不用,建议改为「已停用」。`,
      )
    )
      return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/operators/${initial.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "删除失败");
        return;
      }
      router.push("/operator/admin/operators");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 border-destructive/30 p-5 lg:col-span-2">
      <h2 className="text-sm font-medium text-destructive">危险操作</h2>
      <p className="text-xs text-muted-foreground">
        删除运营 / 管理员账户后无法恢复。如果对方还可能回来,推荐改为「已停用」。
      </p>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={destroy}
          disabled={isSelf || busy}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          {isSelf ? "无法删除自己" : "删除账户"}
        </Button>
      </div>
    </Card>
  );
}
