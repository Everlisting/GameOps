"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RotateCcw, Save, Send } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";

import { Markdown } from "./Markdown";

interface VersionContent {
  id: string | null;
  version: number;
  content: string;
  format: string;
  status: string;
  revision: number;
  checksum: string;
  error: string | null;
  chunkCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
}

type VersionMeta = Omit<VersionContent, "content"> & { id: string };

interface DocumentPayload {
  document: {
    id: string;
    title: string;
    source: string;
    mimeType: string;
    hasOriginal: boolean;
    status: string;
    error: string | null;
    updatedAt: string;
    kb: { id: string; name: string };
  };
  draft: VersionContent;
  published: VersionContent | null;
  versions: VersionMeta[];
}

const STATUS_LABEL: Record<string, string> = {
  new: "新草稿",
  draft: "草稿",
  parsing: "解析原件",
  pending: "待索引",
  indexing: "索引中",
  published: "已发布",
  superseded: "历史版本",
  failed: "失败",
};

function statusVariant(status: string): "success" | "warning" | "destructive" | "muted" | "outline" {
  if (status === "published") return "success";
  if (status === "parsing" || status === "pending" || status === "indexing") return "warning";
  if (status === "failed") return "destructive";
  if (status === "draft" || status === "new") return "outline";
  return "muted";
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? fallback;
}

export function KnowledgeEditor({ documentId }: { documentId: string }) {
  const [data, setData] = useState<DocumentPayload | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/operator/knowledge/documents/${documentId}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await responseMessage(response, "读取文档失败"));
    const payload = (await response.json()) as DocumentPayload;
    setData(payload);
    setTitle(payload.document.title);
    setContent(payload.draft.content);
  }, [documentId]);

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "读取文档失败");
    });
  }, [load]);

  const indexing = data?.versions.some(
    (version) =>
      version.status === "parsing" || version.status === "pending" || version.status === "indexing",
  );
  useEffect(() => {
    if (!indexing) return;
    const timer = setInterval(() => void load().catch(() => {}), 3_000);
    return () => clearInterval(timer);
  }, [indexing, load]);

  const dirty = useMemo(
    () => !!data && (title !== data.document.title || content !== data.draft.content),
    [content, data, title],
  );
  const editingLocked =
    data?.draft.status === "parsing" ||
    data?.draft.status === "pending" ||
    data?.draft.status === "indexing" ||
    (data?.versions.length === 0 &&
      (data?.document.status === "pending" || data?.document.status === "indexing"));
  const canPublish =
    !!data?.draft.id &&
    (data.draft.status === "draft" || data.draft.status === "failed") &&
    !dirty &&
    content.trim().length > 0;

  async function saveDraft() {
    if (!data || !dirty) return;
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/operator/knowledge/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          format: data.draft.format === "plain" ? "plain" : "markdown",
          baseRevision: data.draft.revision,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "保存草稿失败"));
      await load();
      setMessage("草稿已保存；当前线上检索内容未改变。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存草稿失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishDraft() {
    if (!data?.draft.id || !canPublish) return;
    setBusy("publish");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/operator/knowledge/documents/${documentId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: data.draft.id,
          baseRevision: data.draft.revision,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "发布失败"));
      await load();
      setMessage("版本已进入索引队列；成功后会自动切换，期间旧版本继续在线。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setBusy(null);
    }
  }

  async function restoreVersion(versionId: string) {
    setBusy("restore");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/operator/knowledge/documents/${documentId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "回滚失败"));
      await load();
      setMessage("已切换到所选历史版本。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "回滚失败");
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">{error ?? "正在读取文档…"}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{data.document.kb.name}</Badge>
        <Badge variant={statusVariant(data.draft.status)}>
          v{data.draft.version} · {STATUS_LABEL[data.draft.status] ?? data.draft.status}
        </Badge>
        {data.published && <Badge variant="success">线上 v{data.published.version}</Badge>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">编辑</TabsTrigger>
          <TabsTrigger value="preview">预览</TabsTrigger>
          <TabsTrigger value="history">版本历史</TabsTrigger>
        </TabsList>

        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>正文草稿</CardTitle>
              <CardDescription>
                保存草稿不会更新向量；确认内容后再发布。PDF、DOCX 和图片编辑的是解析后的 Markdown 副本，原件不覆盖。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!error} data-disabled={editingLocked}>
                  <FieldLabel htmlFor="knowledge-title">标题</FieldLabel>
                  <Input
                    id="knowledge-title"
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                    aria-invalid={!!error}
                    disabled={editingLocked}
                  />
                </Field>
                <Field data-invalid={!!error} data-disabled={editingLocked}>
                  <FieldLabel htmlFor="knowledge-content">Markdown 正文</FieldLabel>
                  <Textarea
                    id="knowledge-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    aria-invalid={!!error}
                    disabled={editingLocked}
                    className="min-h-[32rem] resize-y"
                  />
                  <FieldDescription>
                    {content.length.toLocaleString("zh-CN")} / 2,000,000 字符 · revision {data.draft.revision}
                  </FieldDescription>
                  <FieldError>{error}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-between gap-2">
              <Button onClick={() => void saveDraft()} disabled={!dirty || editingLocked || busy !== null}>
                {busy === "save" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
                保存草稿
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={!canPublish || busy !== null}>
                    <Send data-icon="inline-start" />
                    发布并更新索引
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>发布 v{data.draft.version}？</AlertDialogTitle>
                    <AlertDialogDescription>
                      发布后会异步生成向量。只有索引完整成功，系统才会把线上检索切换到这个版本。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void publishDraft()}>确认发布</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>{title || "未命名文档"}</CardTitle>
              <CardDescription>当前草稿预览；不会显示原始 HTML。</CardDescription>
            </CardHeader>
            <CardContent>
              {content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-muted-foreground">正文为空。</p>}
            </CardContent>
            {data.document.hasOriginal && (
              <CardFooter>
                <Button variant="outline" asChild>
                  <a
                    href={`/api/operator/knowledge/documents/${documentId}/original`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink data-icon="inline-start" />
                    查看或下载原件
                  </a>
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>版本历史</CardTitle>
              <CardDescription>旧版本 chunks 保留，可原子回滚，无需重新调用嵌入模型。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>版本</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>切块</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>v{version.version}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(version.status)}>
                          {STATUS_LABEL[version.status] ?? version.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{version.chunkCount}</TableCell>
                      <TableCell>{version.updatedAt ? fmtDateTime(version.updatedAt) : "—"}</TableCell>
                      <TableCell className="text-right">
                        {version.status === "superseded" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" disabled={busy !== null}>
                                <RotateCcw data-icon="inline-start" />
                                回滚
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>回滚到 v{version.version}？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  系统会立即把线上检索切换到该历史版本，当前发布版本仍会保留。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void restoreVersion(version.id)}>
                                  确认回滚
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.versions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        暂无版本记录
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
