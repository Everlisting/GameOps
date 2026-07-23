"use client";

/**
 * 运营端 Sidebar:品牌头 + 一级菜单(概览/活动/稿件/创作者)+ 底部账户菜单。
 * 阶段3 不放管理员专属菜单(机器/任务/用户管理),阶段8 再加。
 */
import * as React from "react";
import {
  BarChart3,
  Bot,
  CalendarRange,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  History,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  MonitorSmartphone,
  Server,
  Shield,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";

import { NavMain, type NavItem } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { OperatorNavUser } from "./OperatorNavUser";

const NAV_ITEMS: NavItem[] = [
  { title: "概览", url: "/operator/dashboard", icon: LayoutGrid, exact: true },
  { title: "BI 大屏", url: "/operator/bi", icon: MonitorSmartphone, exact: true },
  {
    title: "项目数据",
    url: "/operator/data/streamers",
    icon: BarChart3,
    items: [
      { title: "主播数据", url: "/operator/data/streamers" },
      { title: "视频数据", url: "/operator/data/videos" },
      { title: "直播数据", url: "/operator/data/live" },
    ],
  },
  {
    title: "活动管理",
    url: "/operator/activities",
    icon: CalendarRange,
    items: [
      { title: "全部活动", url: "/operator/activities" },
      { title: "进行中", url: "/operator/activities?status=ONGOING" },
      { title: "草稿", url: "/operator/activities?status=DRAFT" },
      { title: "已结束", url: "/operator/activities?status=ENDED" },
    ],
  },
  {
    title: "稿件管理",
    url: "/operator/submissions",
    icon: ClipboardCheck,
    items: [
      { title: "全部稿件", url: "/operator/submissions" },
      { title: "待审核", url: "/operator/submissions?status=PENDING" },
      { title: "已通过", url: "/operator/submissions?status=APPROVED" },
      { title: "未通过", url: "/operator/submissions?status=REJECTED" },
    ],
  },
  {
    title: "创作者管理",
    url: "/operator/creators",
    icon: Users,
    items: [
      { title: "全部创作者", url: "/operator/creators" },
      { title: "待审核", url: "/operator/creators?status=pending" },
      { title: "已启用", url: "/operator/creators?status=active" },
      { title: "已停用", url: "/operator/creators?status=disabled" },
    ],
  },
  {
    title: "创作灵感",
    url: "/operator/inspirations",
    icon: Lightbulb,
    items: [
      { title: "全部灵感", url: "/operator/inspirations" },
      { title: "视频教程", url: "/operator/inspirations?type=VIDEO_TUTORIAL" },
      { title: "文档教程", url: "/operator/inspirations?type=DOC_TUTORIAL" },
      { title: "创作素材", url: "/operator/inspirations?type=MATERIAL" },
      { title: "草稿", url: "/operator/inspirations?published=false" },
    ],
  },
  {
    title: "采集任务",
    url: "/operator/tasks",
    icon: ListChecks,
    items: [
      { title: "全部", url: "/operator/tasks" },
      { title: "启用中", url: "/operator/tasks?active=true" },
      { title: "已停用", url: "/operator/tasks?active=false" },
    ],
  },
  {
    title: "采集数据",
    url: "/operator/datasets",
    icon: Database,
  },
];

/** 阶段10 AI 助手:对话 OPERATOR 可用,模型设置仅 ADMIN。 */
function buildAssistantItem(isAdmin: boolean): NavItem {
  return {
    title: "AI 助手",
    url: "/operator/assistant",
    icon: Bot,
    items: [
      { title: "对话", url: "/operator/assistant" },
      ...(isAdmin
        ? [
            { title: "用量统计", url: "/operator/assistant/usage" },
            { title: "模型设置", url: "/operator/assistant/settings" },
          ]
        : []),
    ],
  };
}

/** 阶段9 舆情监控:三个二级页 OPERATOR 可看,模型设置仅 ADMIN。 */
function buildOpinionItem(isAdmin: boolean): NavItem {
  return {
    title: "舆情监控",
    url: "/operator/opinion/private",
    icon: MessageSquareText,
    items: [
      { title: "私域", url: "/operator/opinion/private" },
      { title: "公域", url: "/operator/opinion/public" },
      { title: "对比", url: "/operator/opinion/combined" },
      ...(isAdmin ? [{ title: "模型设置", url: "/operator/opinion/settings" }] : []),
    ],
  };
}

/** 把舆情监控插到"稿件管理"前面(即"活动管理"后面)。按 title 定位,避免依赖硬编码索引。 */
function buildNavItems(isAdmin: boolean): NavItem[] {
  const idx = NAV_ITEMS.findIndex((i) => i.title === "稿件管理");
  const opinion = buildOpinionItem(isAdmin);
  const base =
    idx < 0
      ? [...NAV_ITEMS, opinion]
      : [...NAV_ITEMS.slice(0, idx), opinion, ...NAV_ITEMS.slice(idx)];
  // AI 助手 放在「BI 大屏」之后
  const biIdx = base.findIndex((i) => i.title === "BI 大屏");
  const assistant = buildAssistantItem(isAdmin);
  if (biIdx < 0) return [assistant, ...base];
  return [...base.slice(0, biIdx + 1), assistant, ...base.slice(biIdx + 1)];
}

/** 仅 ADMIN 可见的菜单组 */
const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    title: "运营账户",
    url: "/operator/admin/operators",
    icon: ShieldCheck,
  },
  {
    title: "爬虫 Job",
    url: "/operator/admin/jobs",
    icon: Workflow,
    items: [
      { title: "全部 Job", url: "/operator/admin/jobs" },
      { title: "启用中", url: "/operator/admin/jobs?active=true" },
      { title: "已停用", url: "/operator/admin/jobs?active=false" },
    ],
  },
  {
    title: "爬虫机",
    url: "/operator/admin/agents",
    icon: Server,
    items: [
      { title: "全部机器", url: "/operator/admin/agents" },
      { title: "已停用", url: "/operator/admin/agents?status=DISABLED" },
    ],
  },
  {
    title: "csvType 管理",
    url: "/operator/admin/csv-types",
    icon: FileSpreadsheet,
  },
  {
    title: "审计日志",
    url: "/operator/admin/audit-logs",
    icon: History,
  },
];

function BrandHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Shield className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">GameOps</span>
            <span className="truncate text-xs">运营后台</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function OperatorSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; handle: string; isAdmin: boolean };
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <BrandHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={buildNavItems(user.isAdmin)} label="运营工作区" />
        {user.isAdmin && (
          <NavMain items={ADMIN_NAV_ITEMS} label="管理面板" />
        )}
      </SidebarContent>
      <SidebarFooter>
        <OperatorNavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
