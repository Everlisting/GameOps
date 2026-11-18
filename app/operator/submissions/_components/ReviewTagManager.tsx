"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  Search,
  Tags,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  flattenReviewTags,
  tagDescendants,
  type ReviewTagNode,
} from "@/lib/review-tags";
import { cn } from "@/lib/utils";
import ReviewTagGroups from "./ReviewTagGroups";

type Tag = ReviewTagNode & { usage: number };
type Draft = {
  id?: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  enabled: boolean;
};
const newTag = (parentId: string | null): Draft => ({
  name: "",
  description: "",
  parentId,
  sortOrder: 0,
  enabled: true,
});

export default function ReviewTagManager({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null),
    [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null),
    [deleting, setDeleting] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flat = flattenReviewTags(tags);
  const usageById = new Map(tags.map((tag) => [tag.id, tag.usage]));
  const active = tags.find((tag) => tag.id === activeId) ?? null;
  const branch = active ? tagDescendants(tags, active.id) : null;
  const list = flat.filter(
    (tag) =>
      (!branch || branch.has(tag.id)) &&
      (!q ||
        `${tag.path} ${tag.description}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const rootCount = tags.filter((tag) => !tag.parentId).length;
  function openEditor(tag: Draft) {
    setError("");
    setDraft(tag);
  }
  async function mutate(url: string, method: string, input?: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.error?.message ?? "操作失败，请重试");
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/api/operator/review-tags${draft.id ? `/${draft.id}` : ""}`,
        draft.id ? "PATCH" : "POST",
        draft,
      );
      setDraft(null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await mutate(`/api/operator/review-tags/${deleting.id}`, "DELETE");
      if (activeId === deleting.id) setActiveId(null);
      setDeleting(null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }
  function tree(parentId: string | null, depth = 0): React.ReactNode {
    return flat
      .filter((tag) => tag.parentId === parentId)
      .map((tag) => {
        const hasChildren = tags.some((child) => child.parentId === tag.id);
        const isCollapsed = collapsed.has(tag.id);
        return (
          <li key={tag.id}>
            <div
              className={cn(
                "flex min-w-0 items-center gap-1 rounded-lg pr-2 hover:bg-muted",
                activeId === tag.id && "bg-muted",
              )}
              style={{ paddingLeft: `${Math.min(depth, 6) * 12 + 4}px` }}
            >
              {hasChildren ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${isCollapsed ? "展开" : "收起"}${tag.name}`}
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((old) => {
                      const next = new Set(old);
                      if (next.has(tag.id)) next.delete(tag.id);
                      else next.add(tag.id);
                      return next;
                    })
                  }
                >
                  {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                </Button>
              ) : (
                <span className="size-7 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => setActiveId(tag.id)}
                title={tag.path}
                aria-current={activeId === tag.id ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FolderTree className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{tag.name}</span>
                {!tag.available && <span className="sr-only">（已停用）</span>}
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tagDescendants(tags, tag.id).size}
              </span>
            </div>
            {hasChildren && !isCollapsed && (
              <ul className="flex flex-col gap-1">{tree(tag.id, depth + 1)}</ul>
            )}
          </li>
        );
      });
  }
  const forbiddenParents = draft?.id
    ? tagDescendants(tags, draft.id)
    : new Set<string>();
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">审核标签</h1>
          <p className="text-sm text-muted-foreground">
            按层级组织审核标准，让每次标记都有一致的依据。
          </p>
        </div>
        <Button onClick={() => openEditor(newTag(null))}>
          <Plus data-icon="inline-start" />
          新增标签
        </Button>
      </header>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[256px_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>标签目录</h2>
            </CardTitle>
            <CardDescription>
              {rootCount} 个一级目录 · {tags.length} 个标签
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-3">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              aria-current={!activeId ? "true" : undefined}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                !activeId && "bg-muted font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                <Tags className="size-4" />
                全部标签
              </span>
              <span className="tabular-nums">{tags.length}</span>
            </button>
            {tags.length ? (
              <ul
                aria-label="标签层级目录"
                className="flex max-h-[50dvh] flex-col gap-1 overflow-auto"
              >
                {tree(null)}
              </ul>
            ) : (
              <p className="px-3 py-5 text-xs text-muted-foreground">
                从一级标签开始，逐步建立审核目录。
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => openEditor(newTag(activeId))}
            >
              <Plus data-icon="inline-start" />
              {active ? "在此目录新增子标签" : "新增一级标签"}
            </Button>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <CardTitle>
                  <h2>{active?.name ?? "全部标签"}</h2>
                </CardTitle>
                <CardDescription>
                  {active
                    ? flat.find((tag) => tag.id === active.id)?.path
                    : "按一级标签分区，展开二级分组查看下级标签"}
                </CardDescription>
              </div>
              <Badge variant="secondary">{list.length} 个标签</Badge>
            </div>
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="搜索审核标签"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="搜索标签名称、路径或说明"
              />
            </InputGroup>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 p-0">
            {list.length > 0 && (
              <ReviewTagGroups
                key={JSON.stringify([activeId, q])}
                tags={flat.map((tag) => ({
                  ...tag,
                  usage: usageById.get(tag.id) ?? 0,
                }))}
                matchedIds={list.map((tag) => tag.id)}
                activeId={active?.id ?? null}
                onEdit={openEditor}
                onCreate={(parentId) => openEditor(newTag(parentId))}
                onDelete={(tag) => {
                  setError("");
                  setDeleting(tag);
                }}
              />
            )}
            {!list.length && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <FolderTree />
                  </EmptyMedia>
                  <EmptyTitle>
                    {tags.length ? "没有匹配的标签" : "建立你的审核标签目录"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {tags.length
                      ? "试试其他关键词，或选择左侧的全部标签。"
                      : "先新增一级标签，再按审核标准添加子标签；启用后即可在稿件审核中选用。"}
                  </EmptyDescription>
                </EmptyHeader>
                {!tags.length && (
                  <EmptyContent>
                    <Button
                      variant="outline"
                      onClick={() => openEditor(newTag(null))}
                    >
                      <Plus data-icon="inline-start" />
                      创建第一个标签
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            )}
          </CardContent>
          <p className="border-t px-5 py-4 text-xs leading-relaxed text-muted-foreground">
            停用上级标签后，其下所有标签将暂停选用。已关联的稿件保留历史标签；含子标签或已被使用的标签不可删除。
          </p>
        </Card>
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "编辑审核标签" : "新增审核标签"}
            </DialogTitle>
            <DialogDescription>
              选择所属目录，并设置标签在审核工作台中的使用状态。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              className="flex flex-col gap-5"
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="tag-name">标签名称</FieldLabel>
                  <Input
                    id="tag-name"
                    autoFocus
                    required
                    maxLength={32}
                    disabled={busy}
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    placeholder="例如：内容质量"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tag-parent">上级标签</FieldLabel>
                  <Select
                    value={draft.parentId ?? "__root"}
                    disabled={busy}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        parentId: value === "__root" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger id="tag-parent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__root">
                          无上级（一级标签）
                        </SelectItem>
                        {flat
                          .filter((tag) => !forbiddenParents.has(tag.id))
                          .map((tag) => (
                            <SelectItem key={tag.id} value={tag.id}>
                              {tag.path}
                              {!tag.available ? "（已停用）" : ""}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tag-description">标签说明</FieldLabel>
                  <Textarea
                    id="tag-description"
                    maxLength={200}
                    disabled={busy}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    placeholder="说明适用情形，帮助审核人员一致判断（可选）"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tag-order">显示顺序</FieldLabel>
                  <Input
                    id="tag-order"
                    type="number"
                    min={0}
                    max={99999}
                    required
                    disabled={busy}
                    value={draft.sortOrder}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        sortOrder: Number(event.target.value),
                      })
                    }
                  />
                  <FieldDescription>
                    同一级中，数字越小越靠前。
                  </FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="tag-enabled"
                    disabled={busy}
                    checked={draft.enabled}
                    onCheckedChange={(checked) =>
                      setDraft({ ...draft, enabled: checked === true })
                    }
                  />
                  <FieldLabel htmlFor="tag-enabled">启用此标签</FieldLabel>
                </Field>
              </FieldGroup>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={busy || !draft.name.trim()}>
                  {busy ? "正在保存…" : "保存标签"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>删除标签「{deleting?.name}」？</DialogTitle>
            <DialogDescription>
              删除后无法恢复。你也可以编辑标签，将其设为停用。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              {busy ? "正在删除…" : "删除标签"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
