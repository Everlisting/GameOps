"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, RotateCcw, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFileSize, identifyInspirationFile, inspirationFileSchema, MAX_INSPIRATION_FILES, resourceKinds, type InspirationFileData } from "@/lib/inspiration-files";
import { INSPIRATION_UPLOAD_CONFIG, inspirationUploadSizeError } from "@/lib/inspiration-upload";

type FailedUpload = { id: string; file: File; message: string };

export default function MultiFileUpload({ files, onChange, onBusyChange, disabled }: {
  files: InspirationFileData[];
  onChange: (files: InspirationFileData[]) => void;
  onBusyChange: (blocked: boolean) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const current = useRef(files);
  current.current = files;
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<FailedUpload[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { onBusyChange(busy || failures.length > 0); }, [busy, failures.length, onBusyChange]);
  const accept = resourceKinds.flatMap((kind) => Object.keys(INSPIRATION_UPLOAD_CONFIG[kind].mimeToExt)).join(",");

  function change(next: InspirationFileData[]) { current.current = next; onChange(next); }

  async function upload(batch: FailedUpload[]) {
    if (busy || disabled) return;
    if (current.current.length + batch.length > MAX_INSPIRATION_FILES) { setMessage("一个素材最多30个文件，请减少本次选择的数量。"); return; }
    setMessage("");
    setBusy(true);
    for (let index = 0; index < batch.length; index++) {
      const entry = batch[index];
      setStatus(`正在上传 ${index + 1} / ${batch.length}：${entry.file.name}`);
      try {
        const identity = identifyInspirationFile(entry.file.type, entry.file.name);
        if (!identity) throw new Error("不支持此格式，请使用图片、视频、音频、PDF、TXT、Markdown或ZIP。");
        const sizeError = inspirationUploadSizeError(identity.kind, entry.file.size);
        if (sizeError) throw new Error(sizeError);
        const response = await fetch(`/api/operator/uploads/inspiration?kind=${identity.kind}`, { method: "POST", headers: { "Content-Type": identity.mime }, body: entry.file });
        const data: unknown = await response.json();
        if (!response.ok) {
          const error = data && typeof data === "object" && "error" in data ? data.error : null;
          throw new Error(error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "上传失败，请重试");
        }
        if (!data || typeof data !== "object") throw new Error("上传响应无效");
        const saved = inspirationFileSchema.parse({ ...data, id: entry.id, name: entry.file.name, kind: identity.kind });
        change([...current.current, saved]);
        setFailures((previous) => previous.filter((item) => item.id !== entry.id));
      } catch (error) {
        setFailures((previous) => [...previous.filter((item) => item.id !== entry.id), { ...entry, message: error instanceof Error ? error.message : "上传失败" }]);
      }
    }
    setBusy(false);
    setStatus("本次上传已处理完成");
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...files];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    change(next);
  }

  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" multiple accept={accept} className="hidden" aria-label="选择多个素材文件" onChange={(event) => {
        const picked = Array.from(event.target.files ?? []);
        event.target.value = "";
        void upload(picked.map((file) => ({ id: crypto.randomUUID(), file, message: "" })));
      }} />
      <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy || disabled || files.length >= MAX_INSPIRATION_FILES}><Upload data-icon="inline-start" />{busy ? "上传中…" : files.length ? "追加文件" : "选择文件（可多选）"}</Button>
      <span className="text-sm text-muted-foreground">{files.length} / {MAX_INSPIRATION_FILES} 个文件</span>
    </div>
    <p className="text-sm leading-6 text-muted-foreground">允许混合格式。图片≤50 MB、视频≤500 MB、音频≤100 MB、文档/ZIP≤1 GB。首个文件作为主文件预览，文件原样保存。</p>
    <p role="status" className={status ? "text-sm text-muted-foreground" : "sr-only"}>{status}</p>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    {files.length > 0 && <ol className="flex flex-col divide-y rounded-lg border">
      {files.map((file, index) => <li key={file.id} className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <FileText className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`file-name-${file.id}`} className="sr-only">文件显示名称</label>
          <Input id={`file-name-${file.id}`} aria-label={`文件名称 ${index + 1}`} value={file.name} maxLength={255} disabled={busy || disabled} onChange={(event) => change(files.map((item) => item.id === file.id ? { ...item, name: event.target.value } : item))} />
          <span className="text-xs text-muted-foreground">{index === 0 ? "主文件 · " : ""}{INSPIRATION_UPLOAD_CONFIG[file.kind].label} · {formatFileSize(file.size)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-11" disabled={busy || disabled || index === 0} title="设为主文件" aria-label={`将文件 ${index + 1} 设为主文件`} onClick={() => change([file, ...files.filter((item) => item.id !== file.id)])}><Star /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-11" disabled={busy || disabled || index === 0} aria-label={`上移文件 ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-11" disabled={busy || disabled || index === files.length - 1} aria-label={`下移文件 ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-11" disabled={busy || disabled} aria-label={`移除文件 ${index + 1}`} onClick={() => change(files.filter((item) => item.id !== file.id))}><Trash2 /></Button>
        </div>
      </li>)}
    </ol>}
    {failures.length > 0 && <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3">
      <p className="text-sm text-destructive">以下文件尚未加入素材，请重试或移除后再保存：</p>
      {failures.map((entry) => <div key={entry.id} className="flex min-w-0 items-center gap-2"><p className="min-w-0 flex-1 break-words text-sm">{entry.file.name}：{entry.message}</p><Button type="button" size="icon" variant="ghost" className="size-11" aria-label={`重试上传 ${entry.file.name}`} disabled={busy || disabled} onClick={() => void upload([entry])}><RotateCcw /></Button><Button type="button" size="icon" variant="ghost" className="size-11" aria-label={`移除失败文件 ${entry.file.name}`} disabled={busy || disabled} onClick={() => setFailures((previous) => previous.filter((item) => item.id !== entry.id))}><Trash2 /></Button></div>)}
    </div>}
  </div>;
}
