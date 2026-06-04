"use client";

/**
 * 按 paramSchema 渲染一个动态表单。被 TriggerDialog 复用。
 *
 * 每个字段右上角带"清除"按钮,有值时显示,点击把字段置 undefined。
 * 含 required 的也允许清除(便于改填),提交时由 Zod 拦下空必填。
 */
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";

import type { ParamSchemaItem } from "./ParamSchemaEditor";
import ExcelParamField from "./ExcelParamField";

export default function ParamForm({
  schema,
  values,
  onChange,
}: {
  schema: ParamSchemaItem[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  function set(name: string, v: unknown) {
    onChange({ ...values, [name]: v });
  }
  function clear(name: string) {
    const next = { ...values };
    delete next[name];
    onChange(next);
  }

  if (schema.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        该 Job 没有参数
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {schema.map((item) => {
        const v = values[item.name];
        const hasValue =
          v !== undefined &&
          v !== null &&
          !(typeof v === "string" && v === "") &&
          !(Array.isArray(v) && v.length === 0);

        // 共用的字段头:label + 可选「清除」按钮
        const Header = (
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Label className="text-xs">
              {item.label ?? item.name}{" "}
              {item.required && <span className="text-destructive">*</span>}
            </Label>
            {hasValue && (
              <button
                type="button"
                onClick={() => clear(item.name)}
                className="inline-flex items-center gap-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground"
                title="清除该字段"
              >
                <X className="size-3" />
                清除
              </button>
            )}
          </div>
        );

        if (item.type === "DATE") {
          // DatePickerField 自带 label,这里不要包 Header(免得重复 label)
          return (
            <div key={item.name}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs">
                  {item.label ?? item.name}
                  {item.required && <span className="ml-0.5 text-destructive">*</span>}
                </span>
                {hasValue && (
                  <button
                    type="button"
                    onClick={() => clear(item.name)}
                    className="inline-flex items-center gap-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground"
                    title="清除该字段"
                  >
                    <X className="size-3" />
                    清除
                  </button>
                )}
              </div>
              <DatePickerField
                id={`param-${item.name}`}
                /* label 已在上方自渲染,这里传空 */
                label=""
                value={typeof v === "string" ? v : ""}
                onChange={(s) => set(item.name, s)}
                width="w-full"
              />
            </div>
          );
        }

        if (item.type === "ENUM") {
          return (
            <div key={item.name}>
              {Header}
              <Select
                value={typeof v === "string" ? v : undefined}
                onValueChange={(val) => set(item.name, val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  {(item.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (item.type === "EXCEL") {
          return (
            <div key={item.name}>
              {Header}
              <ExcelParamField
                inputId={`param-${item.name}`}
                requiredColumns={item.columns ?? []}
                value={v}
                onChange={(rows) => set(item.name, rows)}
              />
            </div>
          );
        }

        if (item.type === "NUMBER") {
          return (
            <div key={item.name}>
              {Header}
              <Input
                type="number"
                value={typeof v === "number" ? v : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") clear(item.name);
                  else {
                    const n = Number(raw);
                    if (Number.isNaN(n)) clear(item.name);
                    else set(item.name, n);
                  }
                }}
              />
            </div>
          );
        }

        // STRING
        return (
          <div key={item.name}>
            {Header}
            <Input
              value={typeof v === "string" ? v : ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") clear(item.name);
                else set(item.name, raw);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
