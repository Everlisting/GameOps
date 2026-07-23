"use client";

/**
 * 创作者端 · 悬浮知识助手。
 * 可拖动悬浮球(拖动改位置,点击开关);点开在右侧展开对话框,只查知识库(无业务数据工具)。
 * 每次打开为空(不显示历史);左下角「历史」控件查看/载入近 1 月对话;可提交反馈(运营端可见)。
 */
import { useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Bot, History, MessageSquarePlus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Markdown } from "@/app/operator/assistant/_components/Markdown";

const PROMPTS = ["投稿有什么规范?", "怎么参加活动?", "激励是怎么算的?"];

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

interface ConvItem {
  id: string;
  title: string | null;
  updatedAt: string;
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "history">("chat");
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [fbOpen, setFbOpen] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState(false);
  const convIdRef = useRef<string | undefined>(undefined);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/creator/assistant/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, conversationId: convIdRef.current },
        }),
        fetch: async (url, init) => {
          const res = await fetch(url, init);
          const id = res.headers.get("x-conversation-id");
          if (id) convIdRef.current = id;
          return res;
        },
      }),
    [],
  );

  const { messages, setMessages, sendMessage, status, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  // 工作中(等待/查库/生成,尚无回答文字)时只显示一条"思考中"
  const lastMsg = messages[messages.length - 1];
  const showThinking =
    busy &&
    (!lastMsg ||
      lastMsg.role === "user" ||
      !lastMsg.parts.some((p) => p.type === "text" && p.text.trim().length > 0));

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput("");
  }

  function newConversation() {
    setMessages([]);
    convIdRef.current = undefined;
    setView("chat");
  }

  async function openHistory() {
    setView("history");
    try {
      const res = await fetch("/api/creator/assistant/conversations");
      if (res.ok) {
        const d = (await res.json()) as { conversations?: ConvItem[] };
        setConversations(d.conversations ?? []);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/creator/assistant/conversations/${id}`);
      if (!res.ok) return;
      const d = (await res.json()) as {
        turns?: Array<{
          user: { id: string; text: string };
          variants: Array<{ id: string; text: string }>;
          activeIndex: number;
        }>;
      };
      const loaded: UIMessage[] = [];
      for (const t of d.turns ?? []) {
        loaded.push({ id: t.user.id, role: "user", parts: [{ type: "text", text: t.user.text }] } as UIMessage);
        const a = t.variants[t.activeIndex];
        if (a) loaded.push({ id: a.id, role: "assistant", parts: [{ type: "text", text: a.text }] } as UIMessage);
      }
      setMessages(loaded);
      convIdRef.current = id;
      setView("chat");
    } catch {
      /* ignore */
    }
  }

  async function submitFeedback() {
    const note = fbText.trim();
    if (!note) return;
    try {
      await fetch("/api/creator/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, conversationId: convIdRef.current }),
      });
      setFbText("");
      setFbOpen(false);
      setFbSent(true);
      setTimeout(() => setFbSent(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed right-4 top-4 bottom-4 z-50 flex w-[min(400px,92vw)] flex-col rounded-xl border bg-background shadow-2xl duration-200 animate-in fade-in slide-in-from-right-4">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" /> 创作者助手
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="新对话"
            onClick={newConversation}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="关闭"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 主体:对话 / 历史 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {view === "history" ? (
          <div className="space-y-1">
            <div className="mb-2 text-xs text-muted-foreground">近 1 月对话</div>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无历史对话。</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void loadConversation(c.id)}
                  className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  {c.title || "对话"}
                </button>
              ))
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm">你好!我是创作者助手 👋 有平台规则、活动规范、创作指引方面的问题都可以问我,我会查知识库回答并标注来源。</p>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-accent"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const textParts = m.parts.filter((p) => p.type === "text");
              // 助手消息在工具调用阶段还没有文字 → 不渲染空气泡,交给下方"思考中"
              if (m.role === "assistant" && textParts.length === 0) return null;
              return (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                        : "border bg-background",
                    )}
                  >
                    {m.role === "user"
                      ? textParts.map((p, i) => <span key={i}>{p.text}</span>)
                      : textParts.map((p, i) => <Markdown key={i}>{p.text}</Markdown>)}
                  </div>
                </div>
              );
            })}
            {showThinking && (
              <div className="flex justify-start">
                <div className="rounded-2xl border bg-background px-3 py-2 text-xs text-muted-foreground">
                  💭 思考中…
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                出错:{error.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 反馈框 */}
      {fbOpen && (
        <div className="space-y-2 border-t p-2">
          <Textarea
            value={fbText}
            onChange={(e) => setFbText(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="写下你的反馈或建议(运营会看到)"
            className="min-h-0 resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setFbOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submitFeedback()} disabled={!fbText.trim()}>
              提交
            </Button>
          </div>
        </div>
      )}

      {/* 底部工具行:左下角历史 + 反馈 */}
      <div className="flex items-center gap-2 border-t px-3 py-1.5 text-xs">
        <button
          type="button"
          onClick={() => (view === "history" ? setView("chat") : void openHistory())}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" /> {view === "history" ? "返回对话" : "历史"}
        </button>
        <button
          type="button"
          onClick={() => setFbOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> 反馈
        </button>
        {fbSent && <span className="text-emerald-600">已提交,谢谢!</span>}
      </div>

      <form
        className="flex items-end gap-1.5 border-t p-2"
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
          rows={1}
          placeholder="输入问题,Enter 发送"
          className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={busy || !input.trim()} title="发送">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function CreatorAssistantWidget({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offX: number;
    offY: number;
    moved: boolean;
  } | null>(null);

  if (!configured) return null;

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      moved: false,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    if (d.moved) {
      setPos({
        x: clamp(e.clientX - d.offX, 4, window.innerWidth - 60),
        y: clamp(e.clientY - d.offY, 4, window.innerHeight - 60),
      });
    }
  }
  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) setOpen((o) => !o);
  }

  return (
    <>
      <button
        type="button"
        title="创作者助手"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        className={cn(
          "fixed z-40 flex size-13 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
          !pos && "bottom-6 right-6",
        )}
      >
        <Bot className="size-6" />
      </button>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
    </>
  );
}
