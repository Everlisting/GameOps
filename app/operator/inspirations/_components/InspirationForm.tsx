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
import { X } from "lucide-react";

import HoldButton from "@/components/HoldButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INSPIRATION_TYPES,
  INSPIRATION_TYPE_LABEL,
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABEL,
  SUGGESTED_TAGS,
  type InspirationType,
  type MaterialCategory,
  inspirationCreateSchema,
} from "@/lib/validation/inspiration";
import UploadField from "./UploadField";
import MultiFileUpload from "./MultiFileUpload";
import { inspirationFiles, type InspirationFileData } from "@/lib/inspiration-files";
import { INSPIRATION_TOPICS } from "@/lib/inspiration-catalog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

export type InspirationFormInitial = {
  id?: string;
  type: InspirationType;
  category: MaterialCategory | null;
  title: string;
  summary: string;
  content: string;
  url: string;
  files?: InspirationFileData[];
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
  const [files, setFiles] = useState<InspirationFileData[]>(() => inspirationFiles({ ...initial, url: initial.url || null }));
  const [url, setUrl] = useState(() => inspirationFiles({ ...initial, url: initial.url || null }).length ? "" : initial.url);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [published, setPublished] = useState(initial.published);

  const [operation, setOperation] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteAttempt, setDeleteAttempt] = useState(0);
  const busy = operation !== null || uploadingFiles;

  // 各 type 的字段提示 + 上传 kind/MIME 联动
  const hints = useMemo(() => computeHints(type, category), [type, category]);


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
    if (busy) return;
    setError(null);
    setOperation("save");
    try {
      const body = {
        type,
        category: type === "MATERIAL" ? category : null,
        title,
        summary: summary || null,
        content: content || null,
        url: files[0]?.url ?? (url || null),
        files,
        coverImage: coverImage || null,
        tags,
        published,
      };

      const validation = inspirationCreateSchema.safeParse(body);
      if (!validation.success) {
        setError(validation.error.issues.map((issue) => issue.message).join("；"));
        return;
      }

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
      if (!res.ok) {
        const data = await res.json();
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        return;
      }
      if (isEdit) {
        router.refresh();
      } else {
        router.replace("/operator/inspirations");
      }
    } catch {
      setError("网络错误,请重试");
    } finally {
      setOperation(null);
    }
  }

  async function destroy() {
    if (!initial.id || busy) return;
    setError(null);
    setOperation("delete");
    try {
      const res = await fetch(`/api/operator/inspirations/${initial.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.replace("/operator/inspirations");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.message ?? "删除失败");
    } catch {
      setError("删除失败，请检查网络后重试。");
    }
    setOperation(null);
    setDeleteAttempt((attempt) => attempt + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5 p-5">
        <h2 className="text-sm font-medium">基础信息</h2>

        <Field>
          <FieldLabel htmlFor="inspiration-topic">内容主题</FieldLabel>
          <Select value={tags.find((tag) => INSPIRATION_TOPICS.some((topic) => topic.label === tag)) ?? "__all"} onValueChange={(value) => setTags((previous) => [...previous.filter((tag) => !INSPIRATION_TOPICS.some((topic) => topic.label === tag)), ...(value === "__all" ? [] : [value])])}>
            <SelectTrigger id="inspiration-topic"><SelectValue placeholder="选择内容主题" /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="__all">未分类 / 通用资源</SelectItem>{INSPIRATION_TOPICS.map((topic) => <SelectItem key={topic.label} value={topic.label}>{topic.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">选择资源所属主题，方便创作者在主题索引中找到它。</p>
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="ins-form-type" className="mb-1.5 block text-sm">资源类型 *</Label>
            <Select value={type} onValueChange={(v) => changeType(v as InspirationType)}>
              <SelectTrigger id="ins-form-type">
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
              <Label htmlFor="ins-form-category" className="mb-1.5 block text-sm">素材子类 *</Label>
              <Select
                value={category ?? undefined}
                onValueChange={(v) => setCategory(v as MaterialCategory)}
              >
                <SelectTrigger id="ins-form-category">
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
          <p className="mt-1 text-sm text-muted-foreground">上传附件，或填写外部资源链接。</p>
          {type === "DOC_TUTORIAL" && (
            <p className="mt-1 text-sm text-muted-foreground">腾讯文档和飞书公开分享链接可在站内预览，也可以上传 PDF 附件。</p>
          )}
        </div>

        <FieldGroup className="gap-5">
          <MultiFileUpload
            files={files}
            onChange={setFiles}
            onBusyChange={setUploadingFiles}
            disabled={operation !== null}
          />
          <Field>
            <FieldLabel htmlFor="ins-external-url">外部资源链接（选填）</FieldLabel>
            <Input
              id="ins-external-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…（没有上传附件时使用）"
              disabled={operation !== null || files.length > 0}
            />
          </Field>

          <Separator />

          <Field>
            <FieldLabel htmlFor="ins-cover-url">封面图（选填）</FieldLabel>
            <UploadField
              kind="cover"
              accept="image/png,image/jpeg,image/webp,image/gif"
              previewType="image"
              urlInputId="ins-cover-url"
              value={coverImage}
              onChange={setCoverImage}
              placeholder="https://…（也可上传封面图）"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="ins-content">
              正文 {hints.contentRequired && !files.length && "*"}
            </FieldLabel>
            <Textarea
              id="ins-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={20000}
              rows={hints.contentRows}
              placeholder={hints.contentPlaceholder}
              className="font-mono text-xs"
            />
          </Field>
        </FieldGroup>
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
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 [--save-width:4.5rem]">
        {mode === "edit" && (
          <HoldButton
            key={deleteAttempt}
            disabled={busy}
            className="h-8! w-[calc(var(--save-width)*2.5)]"
            onHold={() => void destroy()}
            holdTime={2000}
            holdDescription="长按 2 秒删除素材"
            doneLabel="删除中…"
            resetAfter={0}
            radius={10}
          >
            按住删除
          </HoldButton>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={busy}>
            取消
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={busy}
            className={mode === "edit" ? "w-(--save-width)" : undefined}
          >
            {operation === "save" ? "保存中…" : mode === "create" ? "创建" : "保存"}
          </Button>
        </div>
      </div>

    </div>
  );
}

function computeHints(
  type: InspirationType,
  category: MaterialCategory | null,
) {
  if (type === "MATERIAL" && (category === "AUDIO" || category === "TEMPLATE")) {
    return { section: category === "AUDIO" ? "音效配乐：上传音频或填写资源链接，注明来源及使用范围。" : "模板文件：上传 ZIP 素材包或填写工程文件链接，注明适用软件及版本。", urlRequired: true, urlPlaceholder: "https://...", urlHint: undefined, contentRequired: false, contentRows: 5, contentPlaceholder: "使用说明、来源、授权范围及注意事项" };
  }
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
