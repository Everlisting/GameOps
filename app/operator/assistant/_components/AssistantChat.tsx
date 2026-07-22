"use client";

/**
 * AI 助手 · 对话工作台(阶段 10.2 打磨)。
 * 左栏历史 + Markdown 答案 + 证据卡 + 图标操作条(复制/重试/赞/踩)+ 文件上传 + 动画 + 会话连续。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import {
  ArrowUp,
  Check,
  Copy,
  Paperclip,
  RefreshCw,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";

const EXAMPLES = [
  "本月视频总播放量和稿件数各是多少?",
  "上个月 3 团涨粉最多的 5 个主播是谁?",
  "最近有哪些爬虫任务失败了?",
];

interface ConvItem {
  id: string;
  title: string | null;
  updatedAt: string;
}

/** 工具返回的证据结构(与 lib/assistant/tools/* 一致) */
interface Evidence {
  asOf?: string | null;
  source?: string;
  scope?: Record<string, unknown>;
  links?: string[];
}

function isEvidence(x: unknown): x is Evidence {
  return (
    !!x &&
    typeof x === "object" &&
    ("source" in x || "asOf" in x || "links" in x || "scope" in x)
  );
}

const SCOPE_LABEL: Record<string, string> = {
  groupNo: "团号",
  dateFrom: "起",
  dateTo: "止",
  sortBy: "排序",
  order: "序",
  status: "状态",
  activityId: "活动",
  creatorId: "创作者",
};

function fmtShanghai(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function readAsDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(f);
  });
}

async function toFileParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (f) => ({
      type: "file" as const,
      mediaType: f.type || "application/octet-stream",
      filename: f.name,
      url: await readAsDataURL(f),
    })),
  );
}

/** 消息底部图标操作按钮(ChatGPT/Claude 风格:ghost、hover 出底、图标 14px)。 */
function IconBtn({
  title,
  onClick,
  disabled,
  active,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent",
        active && "text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function EvidenceCard({ ev }: { ev: Evidence }) {
  const scopeEntries = ev.scope
    ? Object.entries(ev.scope).filter(([, v]) => v !== null && v !== undefined && v !== "")
    : [];
  return (
    <div className="w-fit max-w-full space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {ev.source && (
          <span>
            来源 <code className="font-mono text-foreground/70">{ev.source}</code>
          </span>
        )}
        {ev.asOf && <span>数据时间 {fmtShanghai(ev.asOf)}</span>}
      </div>
      {scopeEntries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {scopeEntries.map(([k, v]) => (
            <span key={k} className="rounded-full bg-background px-2 py-0.5">
              {SCOPE_LABEL[k] ?? k}:{String(v)}
            </span>
          ))}
        </div>
      )}
      {ev.links && ev.links.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {ev.links.map((href) => (
            <Link
              key={href}
              href={href}
              className="font-medium text-primary underline underline-offset-2"
            >
              打开数据页 →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex justify-start duration-300 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-1 rounded-2xl border bg-background px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}

export function AssistantChat({
  configured,
  isAdmin,
}: {
  configured: boolean;
  isAdmin: boolean;
}) {
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<File[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const convIdRef = useRef<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/operator/assistant/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations?: ConvItem[] };
      setConversations(data.conversations ?? []);
    } catch {
      /* 列表刷新失败不影响对话 */
    }
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/operator/assistant/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, conversationId: convIdRef.current },
        }),
        fetch: async (url, init) => {
          const res = await fetch(url, init);
          const id = res.headers.get("x-conversation-id");
          if (id && id !== convIdRef.current) {
            convIdRef.current = id;
            setActiveId(id);
          }
          return res;
        },
      }),
    [],
  );

  const { messages, setMessages, sendMessage, regenerate, status, error, stop } = useChat({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.id,
    [messages],
  );

  const showThinking = useMemo(() => {
    if (!busy) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role === "user") return true;
    return !last.parts.some((p) => p.type === "text");
  }, [busy, messages]);

  // 已在底部附近时才自动贴底,尊重用户上滚查看历史。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, showThinking]);

  useEffect(() => {
    if (configured) void refreshConversations();
  }, [configured, refreshConversations]);
  useEffect(() => {
    if (status === "ready") void refreshConversations();
  }, [status, refreshConversations]);

  async function send() {
    const t = input.trim();
    if ((!t && attached.length === 0) || busy || !configured) return;
    const files = attached.length ? await toFileParts(attached) : undefined;
    void sendMessage({ text: t, ...(files ? { files } : {}) });
    setInput("");
    setAttached([]);
  }

  async function selectConversation(id: string) {
    if (busy || id === activeId) return;
    try {
      const res = await fetch(`/api/operator/assistant/conversations/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: Array<{ role: string; content: { text?: string } }>;
      };
      const loaded = (data.messages ?? []).map((m, idx) => ({
        id: `${id}-${idx}`,
        role: m.role === "assistant" ? "assistant" : "user",
        parts: [{ type: "text", text: m.content?.text ?? "" }],
      })) as UIMessage[];
      setMessages(loaded);
      convIdRef.current = id;
      setActiveId(id);
      setFeedback({});
    } catch {
      /* 加载失败忽略 */
    }
  }

  function newConversation() {
    if (busy) return;
    setMessages([]);
    convIdRef.current = undefined;
    setActiveId(undefined);
    setFeedback({});
    setAttached([]);
  }

  async function copyMessage(m: UIMessage) {
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      /* 复制失败忽略 */
    }
  }

  async function rate(messageId: string, rating: "up" | "down") {
    setFeedback((f) => ({ ...f, [messageId]: rating }));
    try {
      await fetch("/api/operator/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convIdRef.current,
          clientMessageId: messageId,
          rating,
        }),
      });
    } catch {
      /* 反馈失败忽略 */
    }
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
    <div className="flex min-h-0 flex-1 gap-4">
      {/* 左栏 · 会话历史 */}
      <aside className="flex w-56 shrink-0 flex-col rounded-lg border bg-muted/10">
        <div className="p-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={newConversation}
            disabled={busy}
          >
            + 新对话
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">暂无历史</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectConversation(c.id)}
                disabled={busy}
                className={cn(
                  "w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  c.id === activeId ? "bg-accent font-medium" : "hover:bg-accent/50",
                )}
              >
                {c.title || "新对话"}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 主区 · 对话 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground duration-500 animate-in fade-in">
              <p>问点项目数据试试,我会自动取数并标注统计口径与来源:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setInput(ex);
                    }}
                    className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-accent"
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
                className={cn(
                  "flex duration-300 animate-in fade-in slide-in-from-bottom-2",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div className="flex max-w-[80%] flex-col gap-1.5">
                  {m.parts.map((p, i) => {
                    if (p.type === "text") {
                      return m.role === "user" ? (
                        <div
                          key={i}
                          className="whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground shadow-sm"
                        >
                          {p.text}
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="rounded-2xl border bg-background px-4 py-2 text-sm shadow-sm"
                        >
                          <Markdown>{p.text}</Markdown>
                        </div>
                      );
                    }
                    if (p.type.startsWith("tool-") || p.type === "dynamic-tool") {
                      const name =
                        p.type === "dynamic-tool"
                          ? ((p as { toolName?: string }).toolName ?? "tool")
                          : p.type.slice(5);
                      const state = (p as { state?: string }).state ?? "";
                      const output = (p as { output?: unknown }).output;
                      const ev =
                        state === "output-available" && isEvidence(output) ? output : null;
                      const hint =
                        state === "output-available"
                          ? "已返回"
                          : state === "output-error"
                            ? "出错"
                            : "取数中…";
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                            🔧 调用工具 <code className="font-mono">{name}</code> · {hint}
                          </div>
                          {ev && <EvidenceCard ev={ev} />}
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* 操作条:复制 / 重试(仅末条)/ 赞 / 踩 */}
                  {m.role === "assistant" && !busy && m.parts.some((p) => p.type === "text") && (
                    <div className="flex items-center gap-0.5 pl-1 pt-0.5">
                      <IconBtn title="复制" onClick={() => void copyMessage(m)}>
                        {copiedId === m.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </IconBtn>
                      {m.id === lastAssistantId && (
                        <IconBtn title="重新生成" onClick={() => void regenerate()}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                      <IconBtn
                        title="有帮助"
                        onClick={() => void rate(m.id, "up")}
                        active={feedback[m.id] === "up"}
                        className={feedback[m.id] === "up" ? "text-emerald-600" : undefined}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        title="没帮助"
                        onClick={() => void rate(m.id, "down")}
                        active={feedback[m.id] === "down"}
                        className={feedback[m.id] === "down" ? "text-red-600" : undefined}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {showThinking && <ThinkingDots />}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive duration-300 animate-in fade-in">
              出错:{error.message}
            </div>
          )}
        </div>

        {/* 输入区:附件 chips + 附件按钮 + 无边框输入 + 圆形发送/停止 */}
        <div className="mt-3 rounded-2xl border bg-background p-2 shadow-sm transition-shadow focus-within:shadow-md">
          {attached.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {attached.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs duration-200 animate-in fade-in zoom-in-95"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <form
            className="flex items-end gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = e.target.files ? Array.from(e.target.files) : [];
                if (fs.length) setAttached((a) => [...a, ...fs]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full text-muted-foreground"
              title="添加附件"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="输入问题,Enter 发送,Shift+Enter 换行"
              rows={1}
              className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0"
            />

            {busy ? (
              <Button
                type="button"
                size="icon"
                className="shrink-0 rounded-full"
                title="停止"
                onClick={() => stop()}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="shrink-0 rounded-full transition-transform hover:scale-105"
                title="发送"
                disabled={!input.trim() && attached.length === 0}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
