"use client";

/**
 * 易闪审核结果导入:
 *   每行 = "platform,externalId,status[,note]"
 *   status 接受 APPROVED/REJECTED/PENDING 或 通过/未通过/待审 等中文
 *   首行若是表头(platform/平台 开头)自动跳过。
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ParsedRow = {
  platform: string;
  externalId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note?: string;
};

type ImportResult = {
  inputCount: number;
  dedupedCount: number;
  matchedCount: number;
  unmatched: {
    platform: string;
    externalId: string;
    status: string;
    note?: string;
  }[];
};

const STATUS_ALIASES: Record<string, ParsedRow["status"]> = {
  approved: "APPROVED",
  rejected: "REJECTED",
  pending: "PENDING",
  通过: "APPROVED",
  已通过: "APPROVED",
  未通过: "REJECTED",
  不通过: "REJECTED",
  驳回: "REJECTED",
  待审: "PENDING",
  待审核: "PENDING",
};

function normalizeStatus(raw: string): ParsedRow["status"] | null {
  const k = raw.trim().toLowerCase();
  if (STATUS_ALIASES[k]) return STATUS_ALIASES[k];
  if (STATUS_ALIASES[raw.trim()]) return STATUS_ALIASES[raw.trim()];
  return null;
}

function parseText(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { rows: [], errors: [] };

  // 跳过表头
  const first = lines[0].split(",")[0]?.trim().toLowerCase() ?? "";
  const startIdx = first === "platform" || first === "平台" ? 1 : 0;

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const [platform, externalId, statusRaw, ...rest] = cells;
    if (!platform || !externalId || !statusRaw) {
      errors.push(`第 ${i + 1} 行:缺少必要列(platform / externalId / status)`);
      continue;
    }
    const status = normalizeStatus(statusRaw);
    if (!status) {
      errors.push(`第 ${i + 1} 行:状态 "${statusRaw}" 无法识别`);
      continue;
    }
    const note = rest.join(",").trim() || undefined;
    rows.push({ platform, externalId, status, note });
  }
  return { rows, errors };
}

export default function YishanImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseText(text), [text]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/operator/submissions/import-yishan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "导入失败");
        return;
      }
      setResult(data as ImportResult);
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <div>
          <h2 className="text-sm font-medium">粘贴导入数据</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            每行格式:<code className="font-mono">平台,稿件ID,状态[,备注]</code>。
            状态接受 <code>APPROVED/REJECTED/PENDING</code> 或 通过/未通过/待审。
            首行可放表头(自动跳过)。
          </p>
        </div>
        <Textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`platform,externalId,status,note
抖音,7634896905164011707,通过
抖音,7634896905164011708,未通过,标题党
哔哩哔哩,BV1xx411c7mD,通过`}
          className="font-mono text-xs"
        />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            解析:<strong>{parsed.rows.length}</strong> 行有效
            {parsed.errors.length > 0 && (
              <span className="ml-2 text-destructive">
                · {parsed.errors.length} 行错误
              </span>
            )}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || parsed.rows.length === 0}
          >
            {submitting ? "导入中…" : "导入"}
          </Button>
        </div>
        {parsed.errors.length > 0 && (
          <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            {parsed.errors.slice(0, 10).map((e, i) => (
              <div key={i}>{e}</div>
            ))}
            {parsed.errors.length > 10 && (
              <div>… 还有 {parsed.errors.length - 10} 条</div>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </Card>

      {result && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span>导入完成</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="输入行数" value={result.inputCount} />
            <Stat label="去重后" value={result.dedupedCount} />
            <Stat label="匹配并更新" value={result.matchedCount} tone="ok" />
            <Stat label="未匹配" value={result.unmatched.length} tone="warn" />
          </div>

          {result.unmatched.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <FileWarning className="size-3.5" />
                未匹配清单(可能创作者尚未投稿,或 platform/externalId 不一致)
              </div>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">平台</th>
                      <th className="px-3 py-2 text-left font-medium">稿件 ID</th>
                      <th className="px-3 py-2 text-left font-medium">状态</th>
                      <th className="px-3 py-2 text-left font-medium">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.unmatched.map((u, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{u.platform}</td>
                        <td className="px-3 py-1.5 font-mono">{u.externalId}</td>
                        <td className="px-3 py-1.5">{u.status}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {u.note ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href="/operator/submissions">回到稿件列表</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}
