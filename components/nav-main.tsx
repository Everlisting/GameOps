"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type NavItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  /** 完全匹配:仅 pathname === url 时 active(用于"概览"避免被子路径反向激活) */
  exact?: boolean;
  items?: { title: string; url: string }[];
};

/** 把 "/path?a=1&b=2" 拆成 pathname + URLSearchParams */
function parseHref(href: string) {
  const [path, query = ""] = href.split("?");
  return { path, params: new URLSearchParams(query) };
}

export function NavMain({ items, label = "导航" }: { items: NavItem[]; label?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false);
  }

  function pathActive(url: string, exact?: boolean) {
    return exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");
  }

  /** 子项 active:pathname 全等 + url 中声明的每个 query 参数都与当前匹配 */
  function subActive(href: string) {
    const { path, params } = parseHref(href);
    if (pathname !== path) return false;
    for (const [k, v] of params) {
      if (search.get(k) !== v) return false;
    }
    return true;
  }

  return (
    <SidebarGroup aria-label={label}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = pathActive(item.url, item.exact);

          if (!item.items || item.items.length === 0) {
            return (
              <SidebarMenuItem key={item.title} className="rounded-md hover:bg-sidebar-hover">
                <SidebarMenuButton variant="nav" tooltip={item.title} asChild isActive={active}>
                  <Link href={item.url} aria-current={active ? "page" : undefined} onClick={closeMobileSidebar}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          // 优先选择参数最具体的入口,避免「全部」和筛选项同时高亮。
          const selectedSub = item.items
            .filter((sub) => subActive(sub.url))
            .sort((a, b) => parseHref(b.url).params.size - parseHref(a.url).params.size)[0];
          const groupActive = active || item.items.some((sub) => pathActive(parseHref(sub.url).path));
          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={groupActive}
              className="group/collapsible"
            >
              <SidebarMenuItem className="rounded-md hover:bg-sidebar-hover">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    variant="nav"
                    tooltip={item.title}
                    isActive={groupActive}
                    onClick={(event) => {
                      if (!isMobile && state === "collapsed") {
                        if (event.currentTarget.getAttribute("aria-expanded") === "true") event.preventDefault();
                        setOpen(true);
                      }
                    }}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronDown className="ml-auto text-sidebar-foreground/60 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180 motion-reduce:transition-none" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((sub) => (
                      <SidebarMenuSubItem key={sub.title}>
                        <SidebarMenuSubButton asChild isActive={selectedSub === sub}>
                          <Link href={sub.url} aria-current={selectedSub === sub ? "page" : undefined} onClick={closeMobileSidebar}>
                            <span>{sub.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
