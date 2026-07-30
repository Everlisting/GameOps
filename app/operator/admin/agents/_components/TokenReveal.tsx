"use client";

/**
 * Token 一次性回显:创建 / 重置 token 后弹出,带复制按钮 + 强提示。
 * 关掉对话框就回不来,服务端也只存哈希。
 */
import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function TokenReveal({
  open,
  token,
  agentName,
  onClose,
}: {
  open: boolean;
  token: string | null;
  agentName: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"token" | "install" | null>(null);

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied("token");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function copyInstallCommand() {
    if (!token) return;
    const baseUrl = window.location.origin;
    const command = `.\\install.cmd -BaseUrl "${baseUrl}" -Token "${token}"`;
    try {
      await navigator.clipboard.writeText(command);
      setCopied("install");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <AlertDialog open={open && !!token} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-amber-500" />
            {agentName} 的 Token
          </AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="text-destructive">仅此一次显示</strong>
            。关闭后无法重新查看,服务端只存哈希。请立刻保存到爬虫机器的 env 配置里。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border border-border bg-muted/50 p-3">
          <code className="block break-all font-mono text-xs">
            {token ?? ""}
          </code>
        </div>

        <p className="text-[11px] text-muted-foreground">
          将项目的 <code className="font-mono">agent-reference</code> 目录复制到爬虫机,
          在目录内运行下方复制的安装命令。Win10 / Win11 均从 CMD 启动,
          不修改系统永久执行策略。
        </p>

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={copyToken} className="mr-auto">
            {copied === "token" ? (
              <>
                <Check className="size-3.5" />
                已复制
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                复制 Token
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={copyInstallCommand}>
            {copied === "install" ? (
              <>
                <Check className="size-3.5" />
                命令已复制
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                复制安装命令
              </>
            )}
          </Button>
          <AlertDialogAction onClick={onClose}>我已保存,关闭</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
