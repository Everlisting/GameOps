"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** 路由 → 面包屑展示名。最后一段会显示为 BreadcrumbPage(非链接)。*/
const SEGMENT_LABEL: Record<string, string> = {
  dashboard: "工作台",
  activities: "活动",
  submissions: "我的投稿",
  inspirations: "创作灵感",
  account: "账户设置",
  notifications: "通知",
};

export default function CreatorBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // 至少有 "dashboard";路径末段是动态 id 时显示为"详情"
  const items = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    const looksLikeId = !SEGMENT_LABEL[seg] && /[a-z0-9]{8,}/i.test(seg);
    const label = SEGMENT_LABEL[seg] ?? (looksLikeId ? "详情" : seg);
    return { href, label, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((it, i) => (
          <span key={it.href} className="contents">
            {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
            <BreadcrumbItem className={i === 0 ? "hidden md:block" : ""}>
              {it.isLast ? (
                <BreadcrumbPage>{it.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={it.href}>{it.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
