# UI 组件约定

> 所有新页面/组件优先使用 `components/ui/*` 下的 shadcn 封装。
> 改老代码时同步替换原生 HTML 表单控件,避免两种风格混杂。

## 0. 总原则

- **禁止裸用** `<select>`、`type="date"`、`type="datetime-local"`、`type="checkbox"` 等原生表单控件。
  下面每种场景都有对应的 shadcn 组件,直接挑。
- **禁止自己写一套同样语义的样式类**(如 `h-9 rounded-md border border-input ...`)。
  shadcn 组件已经处理好 focus / disabled / aria-invalid / 暗色,自己手写很容易跟 Input、Button 不对齐。
- **className 合并用 `cn()`**(`@/lib/utils`),不要用三元字符串拼接。
- shadcn 原语统一从 `"radix-ui"` 命名空间导入(本项目装的是 `radix-ui@1.x` 聚合包),不要直接装 `@radix-ui/react-*` 子包。例:
  ```ts
  import { Select as SelectPrimitive } from "radix-ui";
  ```

---

## 1. 控件对照表

| 场景 | 用这个 | 文件 | 备注 |
|------|--------|------|------|
| 单选下拉(2–10 项,无需搜索) | `Select` | `components/ui/select.tsx` | 替代原生 `<select>`。`size="sm"` 用于表格工具条 |
| 可搜索/多选下拉、自由输入 | `Combobox` | `components/ui/combobox.tsx` | 基于 `@base-ui/react` |
| 文本/数字/邮箱输入 | `Input` | `components/ui/input.tsx` | 高度 `h-8`,圆角 `rounded-lg`,默认透明背景 |
| 多行文本 | `Textarea` | `components/ui/textarea.tsx` | |
| 复选框 | `Checkbox` | `components/ui/checkbox.tsx` | 支持 `checked="indeterminate"` |
| 按钮 | `Button` | `components/ui/button.tsx` | `variant` / `size` 见组件源码 |
| 表单字段壳 | `Field` + `FieldLabel` | `components/ui/field.tsx` | 比 `<div><Label/>` 更统一,自带 invalid 样式 |
| 卡片 | `Card` | `components/ui/card.tsx` | 容器外壳 |
| 弹层 / 浮层 | `Popover` | `components/ui/popover.tsx` | 弹层选择类组件的载体 |
| 操作菜单(头像下拉、行操作) | `DropdownMenu` | `components/ui/dropdown-menu.tsx` | **不要**拿它当表单选择用 |
| 工具提示 | `Tooltip` | `components/ui/tooltip.tsx` | 用 `TooltipProvider` 包根 |
| 模态侧栏 | `Sheet` | `components/ui/sheet.tsx` | |
| 徽标 | `Badge` | `components/ui/badge.tsx` | 状态展示用,不要自己用 `<span class="bg-*">` |
| 头像 | `Avatar` / `CreatorAvatar` | `components/ui/avatar.tsx` / `components/creator-avatar.tsx` | 创作者优先用 `CreatorAvatar`(含 fallback 与头像预设) |
| 分隔线 | `Separator` | `components/ui/separator.tsx` | |
| 日历 | `Calendar` | `components/ui/calendar.tsx` | 基于 `react-day-picker` |

---

## 2. 日期与时间

shadcn 仓库没有内置 date/datetime picker,本项目自建两个壳,**所有日期/时间选择都走它们**:

### 2.1 日期(纯日期,无时分)

`app/(creator)/_components/DatePickerField.tsx`

- 协议:`value: string` 用 `YYYY-MM-DD`(便于直接放 URL)。
- 内部:`Popover` + shadcn `Calendar`,选完自动收起。
- 用法:
  ```tsx
  <DatePickerField
    id="filter-from"
    label="开始日期"
    value={urlFrom}
    onChange={(v) => commit({ from: v })}
  />
  ```

### 2.2 日期 + 时间(活动起止等)

`app/operator/_components/DateTimePickerField.tsx`

- 协议:`value: string` 用 `YYYY-MM-DDTHH:mm`(等同 `datetime-local` 字符串,方便直接迁移)。
- 内部:`Popover` + `Calendar` + `Input[type="time"]`,日历选日期、时间用原生 time input(本项目唯一仍允许的原生时间控件,因为 shadcn 没有 time picker)。
- 用法:
  ```tsx
  <DateTimePickerField
    id="act-start"
    value={startAt}
    onChange={setStartAt}
  />
  ```

不要再用 `<Input type="datetime-local">` 或 `<Input type="date">`。

---

## 3. URL 同步的筛选条

凡是「下拉/输入会反映到 URL searchParams」的列表过滤栏,**必须**写成 **client 组件**(因为 shadcn `Select` 是受控的、运行在客户端),并走 `router.push` 模式,而不是原生 `<form action>` 提交。

参考实现:
- `app/(creator)/_components/ActivityFilters.tsx`(创作者端活动筛选)
- `app/(creator)/_components/SubmissionFilters.tsx`(创作者端稿件筛选)
- `app/operator/admin/operators/_components/OperatorUserFilters.tsx`(运营端账户筛选)

通用骨架:

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const ALL = "__all"; // Select 不允许空字符串值,空值用哨兵字符串占位

export default function MyFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlStatus = search.get("status") ?? "";

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Select
      value={urlStatus || ALL}
      onValueChange={(v) => commit({ status: v === ALL ? "" : v })}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>全部</SelectItem>
        <SelectItem value="active">已启用</SelectItem>
        <SelectItem value="disabled">已停用</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

要点:
- **空值不能直接当 `SelectItem` 的 value**(radix Select 限制),用哨兵字符串(本项目约定 `"__all"`)代替,落到 URL 前还原成空串。
- 文本输入按 **Enter 或失焦** 提交(`onKeyDown` + `onBlur`),不要每个按键都触发 `router.push`。
- 日期/下拉 `onChange` 立即提交,不需要「搜索」按钮。

服务端筛选页(Server Component)负责读 `searchParams`,渲染时把筛选条作为客户端子组件挂进去,**不要**让 server 组件直接持有过滤状态。

---

## 4. 表单字段壳

新建表单字段优先用 `Field` + `FieldLabel`(`components/ui/field.tsx`),不要再写 `<div><Label className="mb-1.5 block text-xs">…`:

```tsx
<Field>
  <FieldLabel htmlFor="x">字段标题</FieldLabel>
  <Input id="x" value={v} onChange={...} />
</Field>
```

横向布局用 `<Field orientation="horizontal">`。错误信息用 `<FieldError errors={...}>`(承接 Zod 错误数组)。说明文字用 `<FieldDescription>`。

---

## 5. 不能用什么

| 别再写 | 用这个替代 |
|--------|-----------|
| `<select className="h-9 rounded-md border ...">` | `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` |
| `<Input type="date">` | `DatePickerField` |
| `<Input type="datetime-local">` | `DateTimePickerField` |
| `<input type="checkbox">` | `Checkbox` |
| `<form action method>` 做筛选提交 | client 组件 + `router.push` |
| 自定义 `selectCls / inputCls` 串字符串 | 直接用对应 shadcn 组件;真要扩展样式,用 `className` 透传 + `cn()` |
| `<button className="...">` | `Button variant=... size=...` |

---

## 6. 添加新 shadcn 组件

如果你需要一个 shadcn 仓库里有、但 `components/ui/` 还没的组件:

1. 优先直接写 `components/ui/<name>.tsx`,基于 `radix-ui` 命名空间导入,沿用本项目已有的写法(看 `popover.tsx` / `dropdown-menu.tsx` / `select.tsx` 的模板):
   - `"use client"` 顶部
   - `import { X as XPrimitive } from "radix-ui"`
   - 每个子组件加 `data-slot="..."`
   - className 用 `cn()`,样式 token 用 `bg-popover` / `text-muted-foreground` / `border-input` 等已有 CSS 变量
2. 不要直接装 `@radix-ui/react-*` 子包(已经有聚合的 `radix-ui` 包了)。
3. 如果是 Base UI(`@base-ui/react`)的组件,参考 `combobox.tsx` 的写法。

---

## 7. 已有可参考实现

- 简单单选:`app/operator/admin/operators/_components/OperatorUserCreateForm.tsx`(角色)
- 受控 + 禁用:`app/operator/admin/operators/_components/OperatorUserEditForm.tsx`(角色/状态 + `disabled={isSelf}`)
- 表格紧凑工具条(`size="sm"`):`app/operator/submissions/_components/SubmissionsTable.tsx`(批量审核)
- 复杂表单内多 Select:`app/operator/activities/_components/RewardRulesEditor.tsx`(规则类型 + 指标)
- 日期筛选:`app/(creator)/_components/ActivityFilters.tsx`
- DateTime 表单字段:`app/operator/activities/_components/ActivityForm.tsx`

照着这些抄,避免另起炉灶。
