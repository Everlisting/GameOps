/**
 * 运营端布局:Sidebar + Inset 主区。
 * 后台角色门槛为 REVIEWER;审核角色按当前路径受限,各页面/接口再单独校验权限。
 */
import { requireRole } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessStaffPage, homePathForRole } from "@/lib/roles";
import {
  SidebarInset,
  SidebarPageContent,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OperatorSidebar } from "./_components/OperatorSidebar";
import OfflineAgentBadge from "./_components/OfflineAgentBadge";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("REVIEWER");
  if (!canAccessStaffPage(session.role, headers().get("x-operator-pathname") ?? "")) {
    redirect(homePathForRole(session.role));
  }

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <OperatorSidebar
          user={{
            name: session.displayName ?? session.username,
            handle: session.username,
            isAdmin: session.role === "ADMIN",
            isReviewer: session.role === "REVIEWER",
          }}
        />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1 md:hidden" aria-label="打开侧边栏" />
            </div>
            {session.role === "ADMIN" && (
              <div className="px-4">
                <OfflineAgentBadge />
              </div>
            )}
          </header>
          <SidebarPageContent>{children}</SidebarPageContent>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
