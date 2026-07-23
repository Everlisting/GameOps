"use client";

/**
 * 知识库管理(ADMIN):建库 / 上传文档(即时切块+嵌入索引)/ 查看状态 / 删除。
 * MVP 仅支持文本类文件(txt / md / csv / json)。
 */
import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Doc {
  id: string;
  title: string;
  mimeType: string;
  status: string;
  chunkCount: number;
  error: string | null;
  createdAt: string;
}
interface Base {
  id: string;
  name: string;
  description: string | null;
  visibleToOperator: boolean;
  visibleToCreator: boolean;
  createdAt: string;
  documents: Doc[];
}

const STATUS_STYLE: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700",
  indexing: "bg-amber-100 text-amber-700",
  pending: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  published: "已索引",
  indexing: "索引中",
  pending: "待索引",
  failed: "失败",
};

export function KnowledgePanel() {
  const [bases, setBases] = useState<Base[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingKb, setUploadingKb] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/operator/knowledge/bases");
      if (res.ok) {
        const d = (await res.json()) as { bases?: Base[] };
        setBases(d.bases ?? []);
      }
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void load();
  }, []);

  // 有文档在 pending/indexing 时,每 3s 自动刷新状态
  useEffect(() => {
    const busyDocs = bases.some((b) =>
      b.documents.some((d) => d.status === "pending" || d.status === "indexing"),
    );
    if (!busyDocs) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [bases]);

  async function createKb() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/operator/knowledge/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setErr("创建知识库失败");
        return;
      }
      setNewName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteKb(id: string) {
    if (!window.confirm("删除该知识库及其所有文档?不可恢复。")) return;
    await fetch(`/api/operator/knowledge/bases/${id}`, { method: "DELETE" });
    await load();
  }

  async function uploadDoc(kbId: string, file: File) {
    setUploadingKb(kbId);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("kbId", kbId);
      fd.append("file", file);
      const res = await fetch("/api/operator/knowledge/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setErr(d?.error?.message || "上传 / 索引失败");
      }
      await load();
    } finally {
      setUploadingKb(null);
    }
  }

  async function deleteDoc(id: string) {
    if (!window.confirm("删除该文档?")) return;
    await fetch(`/api/operator/knowledge/documents/${id}`, { method: "DELETE" });
    await load();
  }

  async function patchVisibility(
    id: string,
    patch: { visibleToOperator?: boolean; visibleToCreator?: boolean },
  ) {
    await fetch(`/api/operator/knowledge/bases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function reindexDoc(id: string) {
    await fetch(`/api/operator/knowledge/documents/${id}/reindex`, { method: "POST" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void createKb();
            }
          }}
          maxLength={60}
          placeholder="新建知识库名称,如「运营 SOP」"
          className="max-w-xs"
        />
        <Button onClick={() => void createKb()} disabled={busy || !newName.trim()}>
          新建知识库
        </Button>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {bases.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无知识库。先新建一个,再上传文档。</p>
      ) : (
        bases.map((b) => (
          <Card key={b.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{b.name}</div>
                {b.description && (
                  <div className="text-xs text-muted-foreground">{b.description}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">可见:</span>
                <Button
                  variant={b.visibleToOperator ? "default" : "outline"}
                  size="sm"
                  title="运营是否可见"
                  onClick={() => void patchVisibility(b.id, { visibleToOperator: !b.visibleToOperator })}
                >
                  运营
                </Button>
                <Button
                  variant={b.visibleToCreator ? "default" : "outline"}
                  size="sm"
                  title="创作者是否可见"
                  onClick={() => void patchVisibility(b.id, { visibleToCreator: !b.visibleToCreator })}
                >
                  创作者
                </Button>
                <label>
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt,.md,.markdown,.csv,.json,.docx,.pdf,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    disabled={uploadingKb === b.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadDoc(b.id, f);
                      e.target.value = "";
                    }}
                  />
                  <span
                    className={cn(
                      "inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm transition-colors hover:bg-accent",
                      uploadingKb === b.id && "pointer-events-none opacity-60",
                    )}
                  >
                    {uploadingKb === b.id ? "索引中…" : "上传文档"}
                  </span>
                </label>
                <Button variant="ghost" size="icon" title="删除知识库" onClick={() => void deleteKb(b.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            {b.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                暂无文档。上传 txt / md / csv / json / docx / pdf,将自动解析、切块并嵌入索引。
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {b.documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                        STATUS_STYLE[d.status] ?? "bg-muted text-muted-foreground",
                      )}
                      title={d.error ?? undefined}
                    >
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.chunkCount} 块
                    </span>
                    {(d.status === "failed" || d.status === "published") && (
                      <button
                        type="button"
                        title="重新索引"
                        onClick={() => void reindexDoc(d.id)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="删除文档"
                      onClick={() => void deleteDoc(d.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
