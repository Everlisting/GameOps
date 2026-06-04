"use client";

/**
 * 灵感表单(新建 / 编辑共用)
 *
 * 联动逻辑:
 *   - type 选 MATERIAL → 显示 category;否则隐藏并清空
 *   - 不同 type/category 下,正文 / 链接 二选一或必填,UI 上提示但不阻断输入
 *
 * 标签:逗号 / 回车切分,chip 展示,可点 × 删除。
 * 提交:POST 新建 / PATCH 编辑;失败时把 zod 详情拍平显示。
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  INSPIRATION_TYPES,
  INSPIRATION_TYPE_LABEL,
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABEL,
  SUGGESTED_TAGS,
  type InspirationType,
  type MaterialCategory,
} from "@/lib/validation/inspiration";
import UploadField from "./UploadField";

export type InspirationFormInitial = {
  id?: string;
  type: InspirationType;
  category: MaterialCategory | null;
  title: string;
  summary: string;
  content: string;
  url: string;
  coverImage: string;
  tags: string[];
  published: boolean;
};

export default function InspirationForm({
  initial,
  mode,
}: {
  initial: InspirationFormInitial;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [type, setType] = useState<InspirationType>(initial.type);
  const [category, setCategory] = useState<MaterialCategory | null>(
    initial.category,
  );
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [content, setContent] = useState(initial.content);
  const [url, setUrl] = useState(initial.url);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [published, setPublished] = useState(initial.published);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // 各 type 的字段提示 + 上传 kind/MIME 联动
  const hints = useMemo(() => computeHints(type, category), [type, category]);
  const upload = useMemo(() => computeUpload(type, category), [type, category]);

  function changeType(next: InspirationType) {
    setType(next);
    // 切到非 MATERIAL 时强制清空 category;切回 MATERIAL 也清空让用户重选
    setCategory(null);
  }

  function addTag(raw: string) {
    const parts = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...tags];
    for (const p of parts) {
      if (!next.includes(p) && next.length < 20) next.push(p);
    }
    setTags(next);
    setTagInput("");
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        type,
        category: type === "MATERIAL" ? category : null,
        title,
        summary: summary || null,
        content: content || null,
        url: url || null,
        coverImage: coverImage || null,
        tags,
        published,
      };

      const isEdit = mode === "edit" && initial.id;
      const res = await fetch(
        isEdit
          ? `/api/operator/inspirations/${initial.id}`
          : "/api/operator/inspirations",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        return;
      }
      if (isEdit) {
        router.refresh();
      } else {
        router.push(`/operator/inspirations/${data.id}`);
      }
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function destroy() {
    if (!initial.id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/operator/inspirations/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "删除失败");
        return;
      }
      router.push("/operator/inspirations");
    } finally {
      setSubmitting(false);
      setConfirmDel(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5 p-5">
        <h2 className="text-sm font-medium">基础信息</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs">类型 *</Label>
            <Select value={type} onValueChange={(v) => changeType(v as InspirationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSPIRATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {INSPIRATION_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "MATERIAL" && (
            <div>
              <Label className="mb-1.5 block text-xs">素材子类 *</Label>
              <Select
                value={category ?? undefined}
                onValueChange={(v) => setCategory(v as MaterialCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择素材类型" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {MATERIAL_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="md:col-span-2">
            <Label htmlFor="ins-title" className="mb-1.5 block text-xs">
              标题 *
            </Label>
            <Input
              id="ins-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="如:AI 生成镜头的 3 个常见 prompt 模板"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ins-summary" className="mb-1.5 block text-xs">
              简介(列表展示)
            </Label>
            <Textarea
              id="ins-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="一句话说清楚这条灵感能解决什么问题,200 字以内"
            />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-5 p-5">
        <div>
          <h2 className="text-sm font-medium">资源</h2>
          <p className="mt-1 text-xs text-muted-foreground">{hints.section}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs">
              资源 {hints.urlRequired && "*"}
            </Label>
            {upload.allowResource ? (
              <UploadField
                kind={upload.kind}
                accept={upload.accept}
                previewType={upload.previewType}
                value={url}
                onChange={setUrl}
                placeholder={hints.urlPlaceholder}
              />
            ) : (
              <p className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
                此类型不需要上传资源,内容填到下方「正文」即可。
              </p>
            )}
            {hints.urlHint && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {hints.urlHint}
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">封面图</Label>
            <UploadField
              kind="cover"
              accept="image/png,image/jpeg,image/webp,image/gif"
              previewType="image"
              value={coverImage}
              onChange={setCoverImage}
              placeholder="可选 · https://… 或上传"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ins-content" className="mb-1.5 block text-xs">
            正文 {hints.contentRequired && "*"}
          </Label>
          <Textarea
            id="ins-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={20000}
            rows={hints.contentRows}
            placeholder={hints.contentPlaceholder}
            className="font-mono text-xs"
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-sm font-medium">标签</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`移除 ${t}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              onBlur={() => tagInput.trim() && addTag(tagInput)}
              placeholder="输入后回车或逗号"
              className="h-8 w-48 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">推荐:</span>
          {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="rounded-md border border-dashed border-input px-2 py-0.5 text-muted-foreground hover:border-ring hover:text-foreground"
            >
              + {t}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-medium">发布</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            草稿仅运营可见;发布后会出现在创作者端的「创作灵感」里。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={published ? "default" : "outline"}
            size="sm"
            onClick={() => setPublished(true)}
          >
            已发布
          </Button>
          <Button
            type="button"
            variant={!published ? "default" : "outline"}
            size="sm"
            onClick={() => setPublished(false)}
          >
            草稿
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          {mode === "edit" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDel(true)}
              disabled={submitting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              删除
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting
              ? "保存中…"
              : mode === "create"
                ? "创建"
                : "保存"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条灵感?</AlertDialogTitle>
            <AlertDialogDescription>
              删除后创作者立刻看不到。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={destroy}
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function computeHints(
  type: InspirationType,
  category: MaterialCategory | null,
) {
  if (type === "VIDEO_TUTORIAL") {
    return {
      section: "视频教程:把抖音/B站等视频链接放在「资源链接」,正文用作补充说明。",
      urlRequired: true,
      urlPlaceholder: "https://www.douyin.com/video/...",
      urlHint: "支持任意可在浏览器打开的视频链接",
      contentRequired: false,
      contentRows: 4,
      contentPlaceholder: "可选:补充背景、亮点章节、互动话题…",
    };
  }
  if (type === "DOC_TUTORIAL") {
    return {
      section: "文档教程:正文与外部链接二选一,二者都填则以正文为主。",
      urlRequired: false,
      urlPlaceholder: "https://...(可选,外部文章/PDF/飞书文档)",
      urlHint: undefined,
      contentRequired: false,
      contentRows: 10,
      contentPlaceholder:
        "支持 Markdown(后续渲染);也可粘贴纯文本。",
    };
  }
  // MATERIAL
  if (category === "VIDEO") {
    return {
      section: "视频素材:放视频外链;封面图可让卡片更显眼。",
      urlRequired: true,
      urlPlaceholder: "https://...(视频可直接 src)",
      urlHint: undefined,
      contentRequired: false,
      contentRows: 3,
      contentPlaceholder: "可选:版权来源 / 使用建议",
    };
  }
  if (category === "IMAGE") {
    return {
      section: "图片素材:放图片直链或图床地址。",
      urlRequired: true,
      urlPlaceholder: "https://...png|jpg|webp",
      urlHint: undefined,
      contentRequired: false,
      contentRows: 3,
      contentPlaceholder: "可选:版权来源 / 使用建议",
    };
  }
  if (
    category === "TEXT_PROMPT" ||
    category === "TEXT_STORY" ||
    category === "TEXT_OTHER"
  ) {
    return {
      section: "文本素材:正文是核心内容,链接选填(原始出处)。",
      urlRequired: false,
      urlPlaceholder: "https://...(可选,原始出处)",
      urlHint: undefined,
      contentRequired: true,
      contentRows: 12,
      contentPlaceholder:
        category === "TEXT_PROMPT"
          ? "粘贴 prompt 内容,可分多段;创作者可以直接复制使用。"
          : category === "TEXT_STORY"
            ? "故事大纲 / 剧本 / 段子文本"
            : "其他文本素材",
    };
  }
  // MATERIAL 还没选 category
  return {
    section: "请先选择素材子类型。",
    urlRequired: false,
    urlPlaceholder: "",
    urlHint: undefined,
    contentRequired: false,
    contentRows: 6,
    contentPlaceholder: "",
  };
}

/**
 * 按 type+category 决定资源上传的 kind / MIME 白名单 / 预览模式。
 * 文本素材不允许上传(内容写在正文里);其他都给上传按钮 + 外链输入并存。
 */
type UploadCfg = {
  allowResource: boolean;
  kind: "image" | "video" | "doc";
  accept: string;
  previewType: "image" | "video" | "doc" | "none";
};

function computeUpload(
  type: InspirationType,
  category: MaterialCategory | null,
): UploadCfg {
  if (type === "VIDEO_TUTORIAL") {
    return {
      allowResource: true,
      kind: "video",
      accept: "video/mp4,video/webm,video/quicktime",
      previewType: "video",
    };
  }
  if (type === "DOC_TUTORIAL") {
    return {
      allowResource: true,
      kind: "doc",
      accept: "application/pdf,text/plain,text/markdown,application/zip",
      previewType: "doc",
    };
  }
  // MATERIAL
  if (category === "VIDEO") {
    return {
      allowResource: true,
      kind: "video",
      accept: "video/mp4,video/webm,video/quicktime",
      previewType: "video",
    };
  }
  if (category === "IMAGE") {
    return {
      allowResource: true,
      kind: "image",
      accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
      previewType: "image",
    };
  }
  // 文本素材 / 还没选 category
  return {
    allowResource: false,
    kind: "doc",
    accept: "",
    previewType: "none",
  };
}
