"use client";

/**
 * AI 助手 · 对话工作台(阶段 10.1:单栏流式对话,不挂工具)。
 * useChat(@ai-sdk/react)+ DefaultChatTransport 指向 /api/operator/assistant/chat。
 */
import { useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "本月视频总播放量和稿件数各是多少?",
  "上个月 3 团涨粉最多的 5 个主播是谁?",
  "解释一下某活动的激励是怎么算的。",
];

export function AssistantChat({
  configured,
  isAdmin,
}: {
  configured: boolean;
  isAdmin: boolean;
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/operator/assistant/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const t = text.trim();
    if (!t || busy || !configured) return;
    void sendMessage({ text: t });
    setInput("");
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-6 text-sm text-amber-800">
        对话模型尚未配置。
        {isAdmin ? (
          <>
            {" "}
            请前往{" "}
            <Link className="font-medium underline" href="/operator/assistant/settings">
              模型设置
            </Link>{" "}
            配置国产模型(provider / model / baseUrl / apiKey)。
          </>
        ) : (
          " 请联系管理员在「AI 助手 · 模型设置」完成配置。"
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <p>问点项目数据试试,我会自动取数并标注统计口径与来源:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(ex)}
                  className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div className="flex max-w-[80%] flex-col gap-1.5">
                {m.parts.map((p, i) => {
                  if (p.type === "text") {
                    return (
                      <div
                        key={i}
                        className={cn(
                          "whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "border bg-background",
                        )}
                      >
                        {p.text}
                      </div>
                    );
                  }
                  if (p.type.startsWith("tool-") || p.type === "dynamic-tool") {
                    const name =
                      p.type === "dynamic-tool"
                        ? ((p as { toolName?: string }).toolName ?? "tool")
                        : p.type.slice(5);
                    const state = (p as { state?: string }).state ?? "";
                    const hint =
                      state === "output-available"
                        ? "已返回"
                        : state === "output-error"
                          ? "出错"
                          : "取数中…";
                    return (
                      <div
                        key={i}
                        className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                      >
                        🔧 调用工具 <code className="font-mono">{name}</code> · {hint}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            出错:{error.message}
          </div>
        )}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="输入问题,Enter 发送,Shift+Enter 换行"
          rows={2}
          className="min-h-0 flex-1 resize-none"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => stop()}>
            停止
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            发送
          </Button>
        )}
      </form>
    </div>
  );
}
