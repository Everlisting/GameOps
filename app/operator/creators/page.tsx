/**
 * 运营端 · 创作者管理 · 列表
 * 过滤:?status= pending|active|disabled / ?q=(命中 UID/抖音昵称/抖音号/易闪 ID) / ?groupNo=
 * 分页:?page=&pageSize=(默认 1 / 50)
 */
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CreatorAvatar } from "@/components/creator-avatar";
import { AccountStatusBadge } from "./_components/AccountStatusBadge";

const STATUS_VALUES = ["pending", "active", "disabled"] as const;

const STATUS_HEADING: Record<(typeof STATUS_VALUES)[number], string> = {
  pending: "待审核创作者",
  active: "已启用创作者",
  disabled: "已停用创作者",
};

function clampPage(raw: string | undefined, fallback = 1) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export default async function OperatorCreatorsPage({
  searchParams,
}: {
  searchParams?: {
    status?: string;
    q?: string;
    groupNo?: string;
    page?: string;
    pageSize?: string;
  };
}) {
  await requireRole("OPERATOR");

  const status = STATUS_VALUES.includes(
    searchParams?.status as (typeof STATUS_VALUES)[number],
  )
    ? (searchParams!.status as (typeof STATUS_VALUES)[number])
    : undefined;
  const q = searchParams?.q?.trim() ?? "";
  const groupNoFilter = searchParams?.groupNo?.trim() ?? "";
  const page = clampPage(searchParams?.page, 1);
  const pageSize = Math.min(clampPage(searchParams?.pageSize, 50), 200);

  const where: Prisma.CreatorWhereInput = {};
  const userWhere: Prisma.UserWhereInput = {};
  if (status) userWhere.status = status;
  // 搜索仅命中 抖音 UID / 抖音昵称 / 抖音号 / 易闪 ID
  if (q) {
    where.OR = [
      { dyUid: { contains: q, mode: "insensitive" } },
      { dyName: { contains: q, mode: "insensitive" } },
      { dyAccount: { contains: q, mode: "insensitive" } },
      { ysId: { contains: q, mode: "insensitive" } },
    ];
  }
  // 团号:独立筛选,contains 匹配以支持前缀/段位
  if (groupNoFilter) {
    where.groupNo = { contains: groupNoFilter, mode: "insensitive" };
  }
  if (Object.keys(userWhere).length > 0) where.user = userWhere;

  const [total, pendingCount, items] = await Promise.all([
    prisma.creator.count({ where }),
    prisma.creator.count({ where: { user: { status: "pending" } } }),
    prisma.creator.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        tier: true,
        groupNo: true,
        dyUid: true,
        dyName: true,
        dyAccount: true,
        ysId: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, email: true, status: true },
        },
        _count: { select: { submissions: true, enrollments: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const heading = status ? STATUS_HEADING[status] : "全部创作者";

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理创作者档案、审核新注册、维护账户状态与平台账号。
          </p>
        </div>
        {pendingCount > 0 && status !== "pending" && (
          <Button asChild variant="secondary">
            <Link href="/operator/creators?status=pending">
              <Badge variant="warning">待审核 {pendingCount}</Badge>
              <span className="ml-2">去审核</span>
            </Link>
          </Button>
        )}
      </header>

      <Card className="mb-5 p-4">
        <form className="flex flex-wrap items-end gap-3">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="creator-q"
              className="mb-1 block text-xs text-muted-foreground"
            >
              搜索
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="creator-q"
                name="q"
                defaultValue={q}
                placeholder="UID / 抖音昵称 / 抖音号 / 易闪 ID"
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-40">
            <label
              htmlFor="creator-group-no"
              className="mb-1 block text-xs text-muted-foreground"
            >
              团号
            </label>
            <Input
              id="creator-group-no"
              name="groupNo"
              defaultValue={groupNoFilter}
              placeholder="按团号筛选"
            />
          </div>
          <Button type="submit" variant="secondary">
            筛选
          </Button>
          {(q || groupNoFilter) && (
            <Button asChild type="button" variant="ghost">
              <Link
                href={status ? `/operator/creators?status=${status}` : "/operator/creators"}
              >
                清除
              </Link>
            </Button>
          )}
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          共 {total} 人 · 当前页 {page} / {totalPages}
        </p>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          {q ? `没有匹配 "${q}" 的创作者。` : "暂无符合条件的创作者。"}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">创作者</th>
                <th className="px-3 py-2.5 font-medium">抖音 UID</th>
                <th className="px-3 py-2.5 font-medium">抖音昵称</th>
                <th className="px-3 py-2.5 font-medium">抖音号</th>
                <th className="px-3 py-2.5 font-medium">易闪 ID</th>
                <th className="px-3 py-2.5 font-medium">团号</th>
                <th className="px-3 py-2.5 font-medium">等级</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium text-right">报名</th>
                <th className="px-3 py-2.5 font-medium text-right">投稿</th>
                <th className="px-3 py-2.5 font-medium">注册时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/operator/creators/${c.id}`}
                      className="flex items-center gap-2 hover:text-primary"
                    >
                      <CreatorAvatar
                        avatar={c.avatarUrl}
                        name={c.nickname}
                        className="h-8 w-8"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.nickname}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          @{c.user.username}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <CellMono value={c.dyUid} />
                  <CellText value={c.dyName} />
                  <CellMono value={c.dyAccount} />
                  <CellMono value={c.ysId} />
                  <CellMono value={c.groupNo} />
                  <td className="px-3 py-2.5 align-top text-xs">
                    {c.tier ? (
                      <Badge variant="outline">{c.tier}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <AccountStatusBadge status={c.user.status} />
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {c._count.enrollments}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {c._count.submissions}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                    {fmtDate(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => {
            const sp = new URLSearchParams();
            if (status) sp.set("status", status);
            if (q) sp.set("q", q);
            if (groupNoFilter) sp.set("groupNo", groupNoFilter);
            if (p !== 1) sp.set("page", String(p));
            if (pageSize !== 50) sp.set("pageSize", String(pageSize));
            const qs = sp.toString();
            return qs ? `/operator/creators?${qs}` : "/operator/creators";
          }}
        />
      )}
    </div>
  );
}

function CellMono({ value }: { value: string | null }) {
  return (
    <td className="px-3 py-2.5 align-top text-xs">
      {value ? (
        <span className="font-mono">{value}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
  );
}

function CellText({ value }: { value: string | null }) {
  return (
    <td className="px-3 py-2.5 align-top text-xs">
      {value ? value : <span className="text-muted-foreground">—</span>}
    </td>
  );
}

function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (p: number) => string;
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      {page > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={buildHref(page - 1)}>
            <ChevronLeft className="size-3.5" />
            上一页
          </Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          <ChevronLeft className="size-3.5" />
          上一页
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button asChild size="sm" variant="outline">
          <Link href={buildHref(page + 1)}>
            下一页
            <ChevronRight className="size-3.5" />
          </Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          下一页
          <ChevronRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
