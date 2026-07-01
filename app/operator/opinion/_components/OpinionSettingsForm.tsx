"use client";

/**
 * 舆情监控 · LLM 模型设置表单(仅 ADMIN)。
 *
 * apiKey 输入框每次都是空态(不回显任何明文 / 密文);当前保存的 mask 显示在下方提示里。
 * 保存成功后 window.location 刷新,让 mask 更新。
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROVIDER_HINT: Record<string, string> = {
  anthropic: "推荐 model:claude-sonnet-4-5 / claude-opus-4-6",
  openai: "推荐 model:gpt-4o / gpt-4.1;兼容端点(如 DeepSeek)可填 baseUrl",
  echo: "离线规则模式,不调 LLM;仍需填 apiKey(任意值),简化状态机",
};

export interface CurrentSettings {
  provider: "anthropic" | "openai" | "echo";
  model: string;
  apiKeyMask: string;
  baseUrl: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  configured: boolean;
}

export function OpinionSettingsForm({ current }: { current: CurrentSettings }) {
  const [provider, setProvider] = useState(current.provider);
  const [model, setModel] = useState(current.model);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(current.baseUrl ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch("/api/opinion/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          apiKey: apiKey,
          baseUrl: baseUrl.trim() || undefined,
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
      // 简单起见走刷新;要更平滑可以改 revalidatePath 但一处配置改动不用那么复杂
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || !model.trim() || !apiKey;

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div>
        <Label className="mb-1.5 block text-xs">Provider *</Label>
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as CurrentSettings["provider"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anthropic">anthropic(Claude)</SelectItem>
            <SelectItem value="openai">openai(GPT / 兼容端点)</SelectItem>
            <SelectItem value="echo">echo(离线规则)</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {PROVIDER_HINT[provider]}
        </p>
      </div>

      <div>
        <Label htmlFor="opn-set-model" className="mb-1.5 block text-xs">
          Model *
        </Label>
        <Input
          id="opn-set-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          maxLength={64}
          placeholder="如 claude-sonnet-4-5 / gpt-4o / echo"
        />
      </div>

      <div>
        <Label htmlFor="opn-set-key" className="mb-1.5 block text-xs">
          API Key *
        </Label>
        <Input
          id="opn-set-key"
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

      <div>
        <Label htmlFor="opn-set-base" className="mb-1.5 block text-xs">
          Base URL(可选)
        </Label>
        <Input
          id="opn-set-base"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com/v1(OpenAI 兼容端点用)"
        />
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
