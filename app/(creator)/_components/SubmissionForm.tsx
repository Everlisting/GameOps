"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Activity = { id: string; name: string };

const PLATFORMS = ["抖音", "哔哩哔哩", "小红书","快手"] as const;
type Platform = (typeof PLATFORMS)[number];

const NO_ACTIVITY: Activity = { id: "", name: "不挂活动" };

export default function SubmissionForm({
  activities,
  fixedActivityId,
}: {
  /** 可挂载的活动(通常只列 ONGOING),为空时仅允许"无活动" */
  activities: Activity[];
  /** 在活动详情页固定提交到本活动 */
  fixedActivityId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[0]);
  const [activityId, setActivityId] = useState<string>(fixedActivityId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const activityItems = useMemo<Activity[]>(
    () => [NO_ACTIVITY, ...activities],
    [activities],
  );
  const activityValue =
    activityItems.find((a) => a.id === activityId) ?? NO_ACTIVITY;

  async function submit() {
    setError(null);
    setOk(false);
    setLoading(true);
    try {
      const body: Record<string, string> = { title, url, platform };
      if (activityId) body.activityId = activityId;
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErr = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(fieldErr || data?.error?.message || "提交失败");
        return;
      }
      setOk(true);
      setTitle("");
      setUrl("");
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {!fixedActivityId && (
        <Field label="挂载活动(可选)">
          <Combobox<Activity>
            items={activityItems}
            value={activityValue}
            onValueChange={(v) => setActivityId(v?.id ?? "")}
            itemToStringLabel={(a) => a.name}
            itemToStringValue={(a) => a.id || "__none__"}
            isItemEqualToValue={(a, b) => a.id === b.id}
          >
            <ComboboxInput placeholder="选择活动" />
            <ComboboxContent>
              <ComboboxEmpty>没有匹配的活动。</ComboboxEmpty>
              <ComboboxList>
                {(item: Activity) => (
                  <ComboboxItem key={item.id || "__none__"} value={item}>
                    {item.name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      )}
      <Field label="标题">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="作品标题"
        />
      </Field>
      <Field label="链接">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <Field label="平台">
        <Combobox<Platform>
          items={PLATFORMS}
          value={platform}
          onValueChange={(v) => v && setPlatform(v)}
        >
          <ComboboxInput placeholder="选择平台" />
          <ComboboxContent>
            <ComboboxEmpty>没有匹配的平台。</ComboboxEmpty>
            <ComboboxList>
              {(item: Platform) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          已提交,等待审核。
        </p>
      )}

      <Button onClick={submit} disabled={loading} className="w-full" size="lg">
        {loading ? "提交中…" : "提交投稿"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
