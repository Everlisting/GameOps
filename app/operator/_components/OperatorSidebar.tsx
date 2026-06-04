"use client";

/**
 * 运营端 Sidebar:品牌头 + 一级菜单(概览/活动/稿件/创作者)+ 底部账户菜单。
 * 阶段3 不放管理员专属菜单(机器/任务/用户管理),阶段8 再加。
 */
import * as React from "react";
import {
  CalendarRange,
  ClipboardCheck,
  Database,
  LayoutGrid,
  Lightbulb,
  ListChecks,
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
      { title: "启用中", url: "/operator/tasks?enabled=true" },
      { title: "已停用", url: "/operator/tasks?enabled=false" },
    ],
  },
  {
    title: "采集数据",
    url: "/operator/datasets",
    icon: Database,
  },
];

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
      { title: "启用中", url: "/operator/admin/jobs?enabled=true" },
      { title: "已停用", url: "/operator/admin/jobs?enabled=false" },
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
        <NavMain items={NAV_ITEMS} label="运营工作区" />
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
