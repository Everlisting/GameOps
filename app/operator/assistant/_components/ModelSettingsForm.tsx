"use client";

/**
 * AI 助手 · 对话模型设置(仅 ADMIN)。
 *
 * 走国产 OpenAI 兼容端点(数据不出境)。apiKey 输入框始终空态,不回显任何明文/密文;
 * 当前保存的 mask 显示在下方提示。保存成功后刷新页面让 mask 更新。
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CurrentProfile {
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyMask: string;
  updatedBy: string | null;
  updatedAt: string | null;
  configured: boolean;
}

export function ModelSettingsForm({ current }: { current: CurrentProfile }) {
  const [provider, setProvider] = useState(current.provider);
  const [model, setModel] = useState(current.model);
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch("/api/operator/assistant/settings?usage=chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.trim(),
          model: model.trim(),
          baseUrl: baseUrl.trim(),
          apiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setErr(detail || data?.error?.message || `保存失败(${res.status})`);
        return;
      }
      setOk(true);
      setApiKey("");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    submitting || !provider.trim() || !model.trim() || !baseUrl.trim() || !apiKey;

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div>
        <Label htmlFor="ai-set-provider" className="mb-1.5 block text-xs">
          Provider *
        </Label>
        <Input
          id="ai-set-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          maxLength={32}
          placeholder="如 bailian / mimo / deepseek"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          仅作标识/日志用;实际调用由 baseUrl 决定。数据不出境,请使用国产模型端点。
        </p>
      </div>

      <div>
        <Label htmlFor="ai-set-model" className="mb-1.5 block text-xs">
          Model *
        </Label>
        <Input
          id="ai-set-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          maxLength={64}
          placeholder="如 qwen-max / qwen-plus"
        />
      </div>

      <div>
        <Label htmlFor="ai-set-base" className="mb-1.5 block text-xs">
          Base URL *(OpenAI 兼容端点)
        </Label>
        <Input
          id="ai-set-base"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="如 https://dashscope.aliyuncs.com/compatible-mode/v1"
        />
      </div>

      <div>
        <Label htmlFor="ai-set-key" className="mb-1.5 block text-xs">
          API Key *
        </Label>
        <Input
          id="ai-set-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          当前保存:
          {current.configured ? (
            <code className="ml-1 font-mono">{current.apiKeyMask}</code>
          ) : (
            <span className="ml-1 text-amber-700">未配置</span>
          )}
          {current.updatedBy && current.updatedAt && (
            <span className="ml-2">
              · 最近由 {current.updatedBy} 更新于{" "}
              {new Date(current.updatedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                hour12: false,
              })}
            </span>
          )}
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          已保存,页面即将刷新…
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button onClick={submit} disabled={disabled}>
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </Card>
  );
}
