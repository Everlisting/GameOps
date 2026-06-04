/**
 * 运营端布局:Sidebar + Inset 主区。
 * 所有 /operator/* 页面进入前要求会话角色 >= OPERATOR(ADMIN 自动包含)。
 */
import { requireRole } from "@/lib/rbac";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OperatorSidebar } from "./_components/OperatorSidebar";
import OperatorBreadcrumb from "./_components/OperatorBreadcrumb";
import OfflineAgentBadge from "./_components/OfflineAgentBadge";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("OPERATOR");

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <OperatorSidebar
          user={{
            name: session.username,
            handle: session.username,
            isAdmin: session.role === "ADMIN",
          }}
        />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <OperatorBreadcrumb />
            </div>
            {session.role === "ADMIN" && (
              <div className="px-4">
                <OfflineAgentBadge />
              </div>
            )}
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
