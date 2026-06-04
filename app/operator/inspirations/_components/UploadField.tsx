"use client";

/**
 * 灵感资源上传组件:支持本地上传 OR 直接粘贴外链。
 *
 * 上传走 POST /api/operator/uploads/inspiration?kind=...,返回站内 URL 后写回 value。
 * 也保留下方文本输入,用户可以粘贴任意 http(s) 链接(视频教程常用抖音/B 站外链)。
 *
 * 预览:
 *   - previewType="image"  → 显示缩略图
 *   - previewType="video"  → 显示原生 video 播放器(本地路径直接可播)
 *   - previewType="doc"    → 显示文件名 chip + 在新窗口打开
 *
 * 上线 OSS 后只换上传端点的写盘逻辑,本组件无需改动。
 */
import { useRef, useState } from "react";
import { ExternalLink, File as FileIcon, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Kind = "cover" | "image" | "video" | "doc";

export default function UploadField({
  kind,
  accept,
  value,
  onChange,
  previewType = "none",
  placeholder = "https://… 或点上方上传",
  showUrlInput = true,
  disabled,
}: {
  kind: Kind;
  /** input[accept] 字符串,例如 "image/*" 或 "video/mp4,video/webm" */
  accept: string;
  value: string;
  onChange: (v: string) => void;
  previewType?: "image" | "video" | "doc" | "none";
  placeholder?: string;
  showUrlInput?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockOut = disabled || uploading;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await fetch("/api/operator/uploads/inspiration", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "上传失败");
        return;
      }
      onChange(data.url as string);
    } catch {
      setError("网络错误,请重试");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onPick}
      />

      {/* 顶部操作行:上传按钮 + 当前值标识 + 清除 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={lockOut}
        >
          <Upload className="size-3.5" />
          {uploading ? "上传中…" : value ? "更换文件" : "上传文件"}
        </Button>
        {value && (
          <>
            <span className="truncate text-[11px] text-muted-foreground">
              {shortLabel(value)}
            </span>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="在新窗口打开"
            >
              <ExternalLink className="size-3.5" />
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
              disabled={lockOut}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              清除
            </Button>
          </>
        )}
      </div>

      {/* 预览区 */}
      {value && previewType !== "none" && (
        <div className="overflow-hidden rounded-md border border-border bg-muted/30">
          {previewType === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="max-h-48 w-auto object-contain"
            />
          )}
          {previewType === "video" && (
            <video
              src={value}
              controls
              preload="metadata"
              className="max-h-64 w-full"
            />
          )}
          {previewType === "doc" && (
            <div className="flex items-center gap-2 p-3 text-xs">
              <FileIcon className="size-4 text-muted-foreground" />
              <span className="truncate">{shortLabel(value)}</span>
            </div>
          )}
        </div>
      )}

      {/* 外链输入:用户也可以贴别处的 URL */}
      {showUrlInput && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={lockOut}
          className="text-xs"
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** 路径或 URL 的尾段,带省略 */
function shortLabel(s: string): string {
  try {
    const u = s.startsWith("/") ? s : new URL(s).pathname;
    const tail = u.split("/").pop() ?? s;
    return tail.length > 48 ? tail.slice(0, 24) + "…" + tail.slice(-16) : tail;
  } catch {
    return s.length > 48 ? s.slice(0, 24) + "…" + s.slice(-16) : s;
  }
}
