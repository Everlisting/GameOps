"use client";

/**
 * 参数 schema 编辑器:可加可删的行,每行 = 一个参数定义。
 * 输出 ParamSchemaItem[],带类型校验由父表单 + 服务端 Zod 一起兜。
 */
import { Trash2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ParamType = "DATE" | "STRING" | "NUMBER" | "ENUM" | "EXCEL";

export type ParamSchemaItem = {
  name: string;
  label?: string;
  type: ParamType;
  required?: boolean;
  default?: string | number;
  options?: string[]; // ENUM 时用,展示用逗号分隔字符串
  columns?: string[]; // EXCEL 时用,必须包含的表头列
};

const TYPE_LABEL: Record<ParamType, string> = {
  DATE: "日期",
  STRING: "文本",
  NUMBER: "数值",
  ENUM: "枚举",
  EXCEL: "表格(Excel)",
};

export default function ParamSchemaEditor({
  value,
  onChange,
}: {
  value: ParamSchemaItem[];
  onChange: (next: ParamSchemaItem[]) => void;
}) {
  function update(i: number, patch: Partial<ParamSchemaItem>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...value, { name: "", type: "STRING", required: false }]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          没有参数;点下方「+ 添加参数」开始
        </p>
      )}
      {value.map((item, i) => (
        <Card key={i} className="p-3">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3">
              <Label className="text-[11px]">参数名 *</Label>
              <Input
                value={item.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="startDate"
                className="font-mono text-xs"
              />
            </div>
            <div className="col-span-3">
              <Label className="text-[11px]">显示名</Label>
              <Input
                value={item.label ?? ""}
                onChange={(e) => update(i, { label: e.target.value || undefined })}
                placeholder="起始日期"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-[11px]">类型 *</Label>
              <Select
                value={item.type}
                onValueChange={(v) =>
                  update(i, {
                    type: v as ParamType,
                    // 切换类型时清掉与新类型不兼容的字段
                    options: v === "ENUM" ? item.options ?? [] : undefined,
                    columns: v === "EXCEL" ? item.columns ?? [] : undefined,
                    default: undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["DATE", "STRING", "NUMBER", "ENUM", "EXCEL"] as const).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <Label className="text-[11px]">默认值</Label>
              <Input
                value={item.default === undefined ? "" : String(item.default)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") update(i, { default: undefined });
                  else if (item.type === "NUMBER") {
                    const n = Number(raw);
                    update(i, { default: Number.isNaN(n) ? undefined : n });
                  } else update(i, { default: raw });
                }}
                placeholder={
                  item.type === "DATE"
                    ? "2026-05-01"
                    : item.type === "NUMBER"
                      ? "10"
                      : ""
                }
              />
            </div>
            <div className="col-span-1 flex items-end justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                title="删除参数"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {item.type === "ENUM" && (
              <div className="col-span-12">
                <Label className="text-[11px]">枚举选项(逗号分隔)*</Label>
                <Input
                  value={(item.options ?? []).join(",")}
                  onChange={(e) =>
                    update(i, {
                      options: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="选项 A,选项 B,选项 C"
                />
              </div>
            )}
            {item.type === "EXCEL" && (
              <div className="col-span-12">
                <Label className="text-[11px]">表头列(逗号分隔)*</Label>
                <Input
                  value={(item.columns ?? []).join(",")}
                  onChange={(e) =>
                    update(i, {
                      columns: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="UID,备注"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  运营上传 .xlsx / .csv 时必须包含这些列。脚本里 <code className="font-mono">json.loads(os.environ[&quot;{item.name || "参数名"}&quot;])</code> 拿到行数组。
                </p>
              </div>
            )}
            <div className="col-span-12 flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={item.required ?? false}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                必填
              </label>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-3.5" />
        添加参数
      </Button>
    </div>
  );
}
