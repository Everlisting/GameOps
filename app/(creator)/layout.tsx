/**
 * 创作者端布局:shadcn Sidebar(sidebar-07 风格) + Inset 主区。
 * 顶部 SidebarTrigger + Separator + Breadcrumb;左下账号区在 NavUser 内。
 */
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import CreatorBreadcrumb from "./_components/CreatorBreadcrumb";

export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("CREATOR");
  const creator = await prisma.creator.findUnique({
    where: { userId: session.sub },
    select: { nickname: true, avatarUrl: true },
  });

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar
          user={{
            name: creator?.nickname ?? session.username,
            handle: session.username,
            avatar: creator?.avatarUrl ?? undefined,
          }}
        />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <CreatorBreadcrumb />
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
