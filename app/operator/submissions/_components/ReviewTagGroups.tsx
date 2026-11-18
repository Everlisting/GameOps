"use client";

import type { ReactNode } from "react";
import {
  ChevronDown,
  FolderTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tagDescendants, type flattenReviewTags } from "@/lib/review-tags";

type Tag = ReturnType<typeof flattenReviewTags>[number] & { usage: number };

export default function ReviewTagGroups({
  tags,
  matchedIds,
  activeId,
  onEdit,
  onCreate,
  onDelete,
}: {
  tags: Tag[];
  matchedIds: string[];
  activeId: string | null;
  onEdit: (tag: Tag) => void;
  onCreate: (parentId: string) => void;
  onDelete: (tag: Tag) => void;
}) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const visible = new Set(matchedIds);
  for (const id of matchedIds) {
    let parentId = byId.get(id)?.parentId;
    while (parentId) {
      visible.add(parentId);
      if (parentId === activeId) break;
      parentId = byId.get(parentId)?.parentId;
    }
  }
  const childrenOf = (id: string) =>
    tags.filter((tag) => tag.parentId === id && visible.has(tag.id));
  const hasChildren = (id: string) => tags.some((tag) => tag.parentId === id);
  const roots = tags.filter(
    (tag) =>
      visible.has(tag.id) && (activeId ? tag.id === activeId : !tag.parentId),
  );

  function status(tag: Tag) {
    return (
      !tag.available && (
        <Badge variant="muted" className="shrink-0">
          {tag.enabled ? "上级停用" : "已停用"}
        </Badge>
      )
    );
  }

  function menu(tag: Tag) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-11 shrink-0 sm:size-9"
              aria-label={`管理标签 ${tag.path}`}
            >
              <MoreHorizontal />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-72">
          <DropdownMenuLabel className="break-words font-normal">
            <p className="text-xs text-muted-foreground">{tag.path}</p>
            {tag.description && (
              <p className="mt-2 text-sm">{tag.description}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              关联 {tag.usage} 条稿件 · 排序 {tag.sortOrder}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onEdit(tag)}>
              <Pencil aria-hidden="true" />
              编辑标签
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCreate(tag.id)}>
              <Plus aria-hidden="true" />
              新增子标签
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!!tag.usage || hasChildren(tag.id)}
              onSelect={() => onDelete(tag)}
            >
              <Trash2 aria-hidden="true" />
              删除标签
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function branch(tag: Tag): ReactNode {
    const children = childrenOf(tag.id);
    const childCount = tags.filter((child) => child.parentId === tag.id).length;
    const row = (
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-card p-2">
        {children.length ? (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 shrink-0"
              aria-label={`展开或收起 ${tag.path}`}
            >
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-150 group-data-[state=closed]/tag-branch:-rotate-90 motion-reduce:transition-none"
              />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <span className="size-9 shrink-0" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="break-words text-sm font-medium">{tag.name}</p>
          <p className="text-xs text-muted-foreground">
            {tag.depth + 1} 级标签 ·{" "}
            {childCount ? `${childCount} 个子标签` : "无子标签"}
          </p>
        </div>
        {status(tag)}
        {menu(tag)}
      </div>
    );
    if (!children.length) return row;
    return (
      <Collapsible
        defaultOpen
        className="group/tag-branch flex min-w-0 flex-col gap-2"
      >
        {row}
        <CollapsibleContent className="ml-5 min-w-0 border-l pl-3">
          <div className="flex min-w-0 flex-col gap-2">
            {children.map((child) => (
              <div key={child.id} className="min-w-0">
                {branch(child)}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <div className="grid min-w-0 items-start gap-4 p-4 xl:grid-cols-2 xl:p-5">
      {roots.map((root) => {
        const children = childrenOf(root.id);
        return (
          <section
            key={root.id}
            aria-labelledby={`tag-group-${root.id}`}
            className="min-w-0 overflow-hidden rounded-xl border bg-card"
          >
            <header className="flex flex-col gap-3 border-b bg-sidebar/40 p-4">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <FolderTree
                    className="mt-0.5 size-5 shrink-0 text-sidebar-primary"
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h3
                      id={`tag-group-${root.id}`}
                      className="break-words text-base font-semibold"
                    >
                      {root.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {root.depth + 1} 级标签 ·{" "}
                      {tagDescendants(tags, root.id).size - 1} 个下级标签
                    </p>
                  </div>
                </div>
                {menu(root)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {root.available ? (
                  <Badge variant="outline">启用中</Badge>
                ) : (
                  status(root)
                )}
                <span className="text-xs text-muted-foreground">
                  关联 {root.usage} 条稿件
                </span>
              </div>
              {root.description && (
                <p className="break-words text-sm leading-6 text-muted-foreground">
                  {root.description}
                </p>
              )}
              {activeId && root.parentId && (
                <p className="break-words text-xs text-muted-foreground">
                  {root.path}
                </p>
              )}
            </header>
            <div className="flex min-w-0 flex-col gap-2 p-4">
              {children.map((child) => (
                <div key={child.id} className="min-w-0">
                  {branch(child)}
                </div>
              ))}
              {!children.length && (
                <p className="py-2 text-sm text-muted-foreground">
                  {hasChildren(root.id) ? "当前搜索仅匹配此标签" : "暂无子标签"}
                </p>
              )}
            </div>
            <div className="px-4 pb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreate(root.id)}
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                新增子标签
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
