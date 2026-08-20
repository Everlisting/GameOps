"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";

import { Markdown } from "@/app/operator/assistant/_components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import {
  composeDailyReportPreview,
  type DailyReportData,
  type FeishuCardTemplate,
  type FeishuReportConfigInput,
  type FeishuReportConfigView,
} from "@/lib/feishu/report-model";

interface ReportResponse {
  config: FeishuReportConfigView;
  data: DailyReportData;
  dateText: string;
}

type Flash = { kind: "ok" | "err"; text: string } | null;

const TEMPLATE_LABEL: Record<FeishuCardTemplate, string> = {
  blue: "蓝色",
  turquoise: "青色",
  green: "绿色",
  grey: "灰色",
};

function configInput(config: FeishuReportConfigView): FeishuReportConfigInput {
  return {
    titleTemplate: config.titleTemplate,
    cardTemplate: config.cardTemplate,
    intro: config.intro,
    showVideoSummary: config.showVideoSummary,
    videoSummaryTitle: config.videoSummaryTitle,
    showTopVideos: config.showTopVideos,
    topVideosTitle: config.topVideosTitle,
    topVideoLimit: config.topVideoLimit,
    showActivities: config.showActivities,
    activitiesTitle: config.activitiesTitle,
    footer: config.footer,
  };
}

export function FeishuReportConfigPanel() {
  const [draft, setDraft] = React.useState<FeishuReportConfigInput | null>(null);
  const [data, setData] = React.useState<DailyReportData | null>(null);
  const [dateText, setDateText] = React.useState("");
  const [updatedBy, setUpdatedBy] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [flash, setFlash] = React.useState<Flash>(null);

  const applyResponse = React.useCallback((response: ReportResponse) => {
    setDraft(configInput(response.config));
    setData(response.data);
    setDateText(response.dateText);
    setUpdatedBy(response.config.updatedBy);
    setUpdatedAt(response.config.updatedAt);
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/operator/admin/feishu/report", { cache: "no-store" });
        if (!res.ok) throw new Error("读取日报配置失败");
        applyResponse((await res.json()) as ReportResponse);
      } catch (error) {
        setFlash({ kind: "err", text: error instanceof Error ? error.message : "读取日报配置失败" });
      } finally {
        setLoading(false);
      }
    })();
  }, [applyResponse]);

  const preview = React.useMemo(
    () => (draft && data ? composeDailyReportPreview(draft, data, dateText) : null),
    [data, dateText, draft],
  );

  function update<K extends keyof FeishuReportConfigInput>(
    key: K,
    value: FeishuReportConfigInput[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setFlash(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch("/api/operator/admin/feishu/report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const response = (await res.json().catch(() => null)) as
        | (ReportResponse & { error?: { message?: string } })
        | null;
      if (!res.ok || !response) {
        setFlash({ kind: "err", text: response?.error?.message ?? "保存日报配置失败" });
        return;
      }
      applyResponse(response);
      setFlash({ kind: "ok", text: "日报配置已保存，后续手动与定时发送立即生效" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">正在加载日报配置与预览数据…</p>;
  }

  if (!draft || !data || !preview) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">{flash?.text ?? "日报配置不可用"}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle>内容与样式</CardTitle>
          <CardDescription>
            标题支持变量 <code className="font-mono">{"{{date}}"}</code>，热门作品标题支持{" "}
            <code className="font-mono">{"{{topN}}"}</code>。开场白和结尾支持 Markdown。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <Field>
              <FieldLabel htmlFor="report-title-template">日报标题</FieldLabel>
              <Input
                id="report-title-template"
                maxLength={80}
                value={draft.titleTemplate}
                onChange={(event) => update("titleTemplate", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="report-card-template">卡片主题</FieldLabel>
              <Select
                value={draft.cardTemplate}
                onValueChange={(value) => update("cardTemplate", value as FeishuCardTemplate)}
              >
                <SelectTrigger id="report-card-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="blue">蓝色</SelectItem>
                    <SelectItem value="turquoise">青色</SelectItem>
                    <SelectItem value="green">绿色</SelectItem>
                    <SelectItem value="grey">灰色</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="report-intro">开场白（可选）</FieldLabel>
            <Textarea
              id="report-intro"
              maxLength={1000}
              placeholder="例如：以下为今日重点运营数据，请查收。"
              value={draft.intro}
              onChange={(event) => update("intro", event.target.value)}
            />
          </Field>

          <Separator />

          <FieldSet>
            <FieldLegend>数据模块</FieldLegend>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="show-video-summary"
                  checked={draft.showVideoSummary}
                  onCheckedChange={(value) => update("showVideoSummary", value === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="show-video-summary">本月视频汇总</FieldLabel>
                  <FieldDescription>稿件数、总播放量和总点赞。</FieldDescription>
                </FieldContent>
              </Field>
              <Field data-disabled={!draft.showVideoSummary}>
                <FieldLabel htmlFor="video-summary-title">模块标题</FieldLabel>
                <Input
                  id="video-summary-title"
                  maxLength={60}
                  disabled={!draft.showVideoSummary}
                  value={draft.videoSummaryTitle}
                  onChange={(event) => update("videoSummaryTitle", event.target.value)}
                />
              </Field>

              <Separator />

              <Field orientation="horizontal">
                <Checkbox
                  id="show-top-videos"
                  checked={draft.showTopVideos}
                  onCheckedChange={(value) => update("showTopVideos", value === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="show-top-videos">热门作品</FieldLabel>
                  <FieldDescription>按本月播放量排序，展示作品链接、播放量和创作者。</FieldDescription>
                </FieldContent>
              </Field>
              <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <Field data-disabled={!draft.showTopVideos}>
                  <FieldLabel htmlFor="top-videos-title">模块标题</FieldLabel>
                  <Input
                    id="top-videos-title"
                    maxLength={60}
                    disabled={!draft.showTopVideos}
                    value={draft.topVideosTitle}
                    onChange={(event) => update("topVideosTitle", event.target.value)}
                  />
                </Field>
                <Field data-disabled={!draft.showTopVideos}>
                  <FieldLabel htmlFor="top-video-limit">展示数量</FieldLabel>
                  <Input
                    id="top-video-limit"
                    type="number"
                    min={1}
                    max={10}
                    disabled={!draft.showTopVideos}
                    value={draft.topVideoLimit}
                    onChange={(event) => update("topVideoLimit", Number(event.target.value))}
                  />
                </Field>
              </FieldGroup>

              <Separator />

              <Field orientation="horizontal">
                <Checkbox
                  id="show-activities"
                  checked={draft.showActivities}
                  onCheckedChange={(value) => update("showActivities", value === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="show-activities">进行中活动</FieldLabel>
                  <FieldDescription>展示当前进行中的活动数量。</FieldDescription>
                </FieldContent>
              </Field>
              <Field data-disabled={!draft.showActivities}>
                <FieldLabel htmlFor="activities-title">模块标题</FieldLabel>
                <Input
                  id="activities-title"
                  maxLength={60}
                  disabled={!draft.showActivities}
                  value={draft.activitiesTitle}
                  onChange={(event) => update("activitiesTitle", event.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <Separator />

          <Field>
            <FieldLabel htmlFor="report-footer">结尾（可选）</FieldLabel>
            <Textarea
              id="report-footer"
              maxLength={1000}
              placeholder="例如：数据每日上午 09:00 自动更新。"
              value={draft.footer}
              onChange={(event) => update("footer", event.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter className="flex-wrap gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            保存配置
          </Button>
          {flash && (
            <Badge variant={flash.kind === "ok" ? "success" : "destructive"} role="status">
              {flash.text}
            </Badge>
          )}
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              上次保存：{fmtDateTime(updatedAt)}{updatedBy ? ` · ${updatedBy}` : ""}
            </span>
          )}
        </CardFooter>
      </Card>

      <Card className="xl:sticky xl:top-6">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>最终发送内容</CardTitle>
            <CardDescription>使用当前数据库数据实时生成；保存后手动和定时发送均采用此内容。</CardDescription>
          </div>
          <Badge variant="outline">{TEMPLATE_LABEL[preview.template]}主题</Badge>
        </CardHeader>
        <CardContent>
          <Card className="overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>{preview.headerTitle}</CardTitle>
              <CardDescription>飞书交互卡片预览</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-0 p-0">
              {preview.sections.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">当前配置没有可发送的内容。</p>
              ) : (
                preview.sections.map((section, index) => (
                  <React.Fragment key={`${section.title ?? "content"}-${index}`}>
                    {index > 0 && <Separator />}
                    <div className="flex flex-col gap-1 p-5 text-sm">
                      {section.title && <p className="font-semibold">{section.title}</p>}
                      <Markdown>{section.content}</Markdown>
                    </div>
                  </React.Fragment>
                ))
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
