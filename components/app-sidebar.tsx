"use client";

import * as React from "react";
import {
  CalendarDays,
  FileText,
  GalleryVerticalEnd,
  LayoutGrid,
  Lightbulb,
} from "lucide-react";

import { NavMain, type NavItem } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
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

/** 顶部品牌块:静态展示,不带切换。*/
function BrandHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">GameOps</span>
            <span className="truncate text-xs">创作者工作台</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const NAV_ITEMS: NavItem[] = [
  { title: "概览", url: "/dashboard", icon: LayoutGrid, exact: true },
  {
    title: "活动",
    url: "/dashboard/activities",
    icon: CalendarDays,
    items: [
      { title: "已参加", url: "/dashboard/activities?enrolled=1" },
      { title: "进行中", url: "/dashboard/activities?status=ONGOING" },
      { title: "已结束", url: "/dashboard/activities?status=ENDED" },
    ],
  },
  {
    title: "我的投稿",
    url: "/dashboard/submissions",
    icon: FileText,
    items: [
      { title: "全部投稿", url: "/dashboard/submissions?status=all" },
      { title: "待审核", url: "/dashboard/submissions?status=PENDING" },
      { title: "已通过", url: "/dashboard/submissions?status=APPROVED" },
      { title: "未通过", url: "/dashboard/submissions?status=REJECTED" },
    ],
  },
  {
    title: "创作灵感",
    url: "/dashboard/inspirations",
    icon: Lightbulb,
  },
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; handle: string; avatar?: string };
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <BrandHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV_ITEMS} label="工作区" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
