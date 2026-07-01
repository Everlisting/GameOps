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

const SEGMENT_LABEL: Record<string, string> = {
  operator: "运营后台",
  dashboard: "概览",
  activities: "活动管理",
  submissions: "稿件管理",
  creators: "创作者管理",
  inspirations: "创作灵感",
  tasks: "采集任务",
  datasets: "采集数据",
  agents: "爬虫机",
  jobs: "爬虫 Job",
  log: "日志",
  runs: "执行历史",
  account: "账户设置",
  admin: "管理面板",
  operators: "运营账户",
  new: "新建",
  edit: "编辑",
  // 阶段9 · 舆情监控
  opinion: "舆情监控",
  private: "私域",
  public: "公域",
  combined: "对比",
  settings: "模型设置",
};

export default function OperatorBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

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
