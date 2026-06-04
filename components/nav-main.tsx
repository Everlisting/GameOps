"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";

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
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = pathActive(item.url, item.exact);

          if (!item.items || item.items.length === 0) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton tooltip={item.title} asChild isActive={active}>
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          const anySubActive = item.items.some((s) => subActive(s.url));
          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={active || anySubActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={active && !anySubActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((sub) => (
                      <SidebarMenuSubItem key={sub.title}>
                        <SidebarMenuSubButton asChild isActive={subActive(sub.url)}>
                          <Link href={sub.url}>
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
