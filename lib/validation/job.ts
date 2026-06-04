/**
 * 阶段4 改造 · CrawlerJob 校验。
 *
 * CrawlerJob = 任务模板,定义"任务怎么跑":
 *   绑定的爬虫机 / 代码仓库 / 工作目录 / 命令模板(含 {{var}}) / 参数 schema /
 *   产物清单(可选 csvType,带的会被上传中台入库) / 单次超时 / 可选 cron。
 *
 * 每次"执行"是一条 CrawlerTask(由 trigger API 或 cron 自动创建)。
 */
import { z } from "zod";

import { KNOWN_CSV_TYPES } from "@/lib/validation/crawler";

const trimNonEmpty = (max: number) => z.string().trim().min(1).max(max);

// ── 参数 schema 单项 ──────────────────────────────────
// 前端按 type 渲染:DATE→DatePickerField, STRING→Input, NUMBER→Input[number], ENUM→Select
// `name` 允许:Unicode 字母(含中文)/ 数字 / 下划线,首字符不能是数字。
// 不允许:`=`(env 变量名分隔符) / 空白 / 控制字符等。
// 之所以放开中文:agent 端会把 paramValues 作为子进程 env 变量注入,
// 用户的爬虫脚本里 os.environ["开始时间"] 这种写法也要能用。
const PARAM_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

export const paramItemSchema = z
  .object({
    name: trimNonEmpty(40).regex(
      PARAM_NAME_RE,
      "参数名允许中文/字母/数字/下划线,且不能数字开头",
    ),
    label: z.string().trim().max(40).optional(),
    /**
     * 参数类型:
     *   DATE / STRING / NUMBER / ENUM:标量值
     *   EXCEL:表格数据,运营触发时上传 .xlsx / .csv,UI 校验包含 columns
     *          指定的列名;agent 端以 JSON 字符串注入 env(脚本 json.loads 即可)
     */
    type: z.enum(["DATE", "STRING", "NUMBER", "ENUM", "EXCEL"]),
    required: z.boolean().default(false),
    // 默认值类型与 type 对齐(string / number),DATE 用 ISO 字符串;EXCEL 无默认值
    default: z.union([z.string(), z.number()]).optional(),
    // ENUM 时必填(非空数组);其它 type 忽略
    options: z.array(trimNonEmpty(80)).max(50).optional(),
    // EXCEL 时必填:表格必须包含的表头列(多余列允许,缺一列则上传校验报错)
    columns: z.array(trimNonEmpty(40)).max(20).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.type === "ENUM") {
      if (!item.options || item.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "type=ENUM 时必须提供 options",
        });
        return;
      }
      if (item.default !== undefined) {
        const defaultStr = String(item.default);
        if (!item.options.includes(defaultStr)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["default"],
            message: "default 必须在 options 范围内",
          });
        }
      }
    }
    if (item.type === "NUMBER" && item.default !== undefined && typeof item.default !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["default"],
        message: "type=NUMBER 时 default 必须是数字",
      });
    }
    if (item.type === "EXCEL") {
      if (!item.columns || item.columns.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns"],
          message: "type=EXCEL 时必须提供至少 1 个 columns",
        });
      } else {
        const seen = new Set<string>();
        for (const c of item.columns) {
          if (seen.has(c)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["columns"],
              message: `columns 重复:${c}`,
            });
            break;
          }
          seen.add(c);
        }
      }
      if (item.default !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["default"],
          message: "type=EXCEL 不支持 default",
        });
      }
    }
  });

export type ParamSchemaItem = z.infer<typeof paramItemSchema>;

// ── 产物清单单项 ──────────────────────────────────────
// path: 相对 workdir 的文件路径(命令执行完后,agent 按这里捡产物);支持 glob(* / ? / [])
// csvType: 可选;带则上传中台入库;不带则留在爬虫机(由脚本自处理,例如发飞书)
// optional: 可选;true 时文件缺失(或 glob 无匹配)不报错,直接跳过
// filterRoot: 可选;入库前的行级筛选,树状结构:
//   - 叶子(leaf):{ column, operator, value? }
//   - 组(group):{ combinator: "AND"|"OR", items: (Leaf|Group)[] }
//   - 顶层是一个 group(默认 AND);可嵌套 OR / 进一步 AND 子组;最多 3 层。

// Filter 操作符常量,跟 lib/parsers/columns.ts 的 FilterOperator 保持一致。
// 不直接 import 避免运行时循环 / Edge 打包问题。
export const FILTER_OPERATORS = [
  "INCLUDES",
  "NOT_INCLUDES",
  "EQUALS",
  "NOT_EQUALS",
  "NOT_EMPTY",
  "EMPTY",
  "GTE",
  "LTE",
  "GT",
  "LT",
] as const;
const OPERATORS_NO_VALUE = new Set(["NOT_EMPTY", "EMPTY"]);

export const filterLeafSchema = z
  .object({
    column: trimNonEmpty(64),
    operator: z.enum(FILTER_OPERATORS),
    /** NOT_EMPTY/EMPTY 不传;其它必填(STRING 或 NUMBER) */
    value: z.union([z.string(), z.number()]).optional(),
  })
  .superRefine((f, ctx) => {
    const needsValue = !OPERATORS_NO_VALUE.has(f.operator);
    if (needsValue && (f.value === undefined || f.value === null || f.value === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `操作符 ${f.operator} 需要填值`,
      });
    }
    if (!needsValue && f.value !== undefined && f.value !== null && f.value !== "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `操作符 ${f.operator} 不应有值`,
      });
    }
  });

export type FilterLeaf = z.infer<typeof filterLeafSchema>;

export type FilterGroup = {
  combinator: "AND" | "OR";
  items: Array<FilterLeaf | FilterGroup>;
};

/** 递归树:z.lazy 引用自身。每个 group 子项可以是 leaf 也可以是另一个 group。 */
export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(["AND", "OR"]),
    items: z.array(z.union([filterLeafSchema, filterGroupSchema])).max(20),
  }),
);

export const outputItemSchema = z.object({
  path: trimNonEmpty(300),
  csvType: z
    .string()
    .trim()
    .min(1)
    .max(64)
    // 不强卡 KNOWN_CSV_TYPES,允许声明尚未注册 parser 的 csvType(留底用)
    .optional(),
  optional: z.boolean().default(false),
  /** 行级筛选树;不填 = 全量入库 */
  filterRoot: filterGroupSchema.optional(),
});

export type OutputItem = z.infer<typeof outputItemSchema>;

// ── Cron 表达式校验 ─────────────────────────────────
// 标准 5 段:m h dom mon dow。只允许数字 / * / , / - / / 字符;不支持 JAN/MON 名称、Jenkins 的 H 占位符。
// 真正的下次执行时间计算由 lib/cron-scheduler 用 cron-parser 完成,这里只挡掉明显错的输入。
const CRON_FIELD_RE = /^[0-9*,\-/]+$/;

export function isValidCronExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((p) => CRON_FIELD_RE.test(p));
}

const cronExpressionSchema = z
  .string()
  .trim()
  .max(120)
  .refine(isValidCronExpression, "cron 表达式必须是标准 5 段格式,且只允许 0-9 * , - / 字符");

// ── Job CRUD ──────────────────────────────────────
const repoTypeSchema = z.enum(["GIT", "SVN"]);

// 共享的字段定义,create/update 复用
const jobFieldShape = {
  name: trimNonEmpty(64),
  description: z.string().trim().max(500).optional(),
  agentId: trimNonEmpty(40),
  repoType: repoTypeSchema,
  repoUrl: trimNonEmpty(500),
  repoBranch: z.string().trim().max(128).optional(),
  workdir: z.string().trim().max(200).default("."),
  command: trimNonEmpty(2000),
  timeoutMinutes: z.number().int().min(1).max(720).default(30),
  paramSchema: z.array(paramItemSchema).max(30).default([]),
  outputs: z.array(outputItemSchema).max(20).default([]),
  cronExpression: cronExpressionSchema.nullable().optional(),
  enabled: z.boolean().default(true),
};

/** 检查 paramSchema 内 name 唯一、outputs 内 path 唯一,以及 command 引用的 {{var}} 都在 paramSchema 里。 */
function refineJobCrossField(
  data: {
    paramSchema?: ParamSchemaItem[];
    outputs?: OutputItem[];
    command?: string;
  },
  ctx: z.RefinementCtx,
) {
  const params = data.paramSchema ?? [];
  const outputs = data.outputs ?? [];

  const seenParam = new Set<string>();
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (seenParam.has(p.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paramSchema", i, "name"],
        message: `参数名重复:${p.name}`,
      });
    }
    seenParam.add(p.name);
  }

  const seenPath = new Set<string>();
  for (let i = 0; i < outputs.length; i++) {
    const o = outputs[i];
    if (seenPath.has(o.path)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputs", i, "path"],
        message: `产物路径重复:${o.path}`,
      });
    }
    seenPath.add(o.path);
  }

  if (data.command) {
    const refs = extractCommandVars(data.command);
    for (const ref of refs) {
      if (!seenParam.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: `命令引用了未声明的参数 {{${ref}}}`,
        });
      }
    }
  }
}

const COMMAND_VAR_RE = /\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*\}\}/gu;

/** 提取命令模板里所有 {{name}} 引用。 */
export function extractCommandVars(command: string): string[] {
  const out = new Set<string>();
  for (const m of command.matchAll(COMMAND_VAR_RE)) {
    out.add(m[1]);
  }
  return [...out];
}

export const createJobSchema = z.object(jobFieldShape).superRefine(refineJobCrossField);

export const updateJobSchema = z
  .object({
    name: jobFieldShape.name.optional(),
    description: jobFieldShape.description,
    agentId: jobFieldShape.agentId.optional(),
    repoType: jobFieldShape.repoType.optional(),
    repoUrl: jobFieldShape.repoUrl.optional(),
    repoBranch: jobFieldShape.repoBranch,
    workdir: z.string().trim().max(200).optional(),
    command: jobFieldShape.command.optional(),
    timeoutMinutes: z.number().int().min(1).max(720).optional(),
    paramSchema: z.array(paramItemSchema).max(30).optional(),
    outputs: z.array(outputItemSchema).max(20).optional(),
    cronExpression: cronExpressionSchema.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine(refineJobCrossField);

// ── Job 触发(手动 trigger 一次) ────────────────────
// paramValues 的 key/value 合法性需要对照具体 Job 的 paramSchema 校验,
// 不能在 Zod 静态层完成,在 API 里 import validateParamValuesAgainstSchema 检查。
export const triggerJobSchema = z.object({
  paramValues: z.record(z.unknown()).default({}),
  priority: z.number().int().min(-100).max(100).optional(),
});

// ── paramValues 运行时校验 ───────────────────────
export type ParamValueError = { path: string; message: string };

/**
 * 把 trigger 时填的 paramValues 套到 Job 的 paramSchema 上校验。
 * - required 缺值 → 报错
 * - 类型不符 → 报错
 * - ENUM 值不在 options → 报错
 * - 未声明的 extra key → 忽略(不报错)
 */
export function validateParamValuesAgainstSchema(
  schema: ParamSchemaItem[],
  values: Record<string, unknown>,
): ParamValueError[] {
  const errors: ParamValueError[] = [];
  for (const item of schema) {
    const v = values[item.name];
    const isMissing = v === undefined || v === null || v === "";
    if (isMissing) {
      if (item.required && item.default === undefined) {
        errors.push({ path: item.name, message: `${item.label ?? item.name} 必填` });
      }
      continue;
    }
    switch (item.type) {
      case "NUMBER":
        if (typeof v !== "number" || Number.isNaN(v)) {
          errors.push({ path: item.name, message: `${item.label ?? item.name} 必须是数字` });
        }
        break;
      case "DATE":
        if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
          errors.push({ path: item.name, message: `${item.label ?? item.name} 必须是合法日期` });
        }
        break;
      case "STRING":
        if (typeof v !== "string") {
          errors.push({ path: item.name, message: `${item.label ?? item.name} 必须是字符串` });
        }
        break;
      case "ENUM":
        if (typeof v !== "string" || !item.options?.includes(v)) {
          errors.push({
            path: item.name,
            message: `${item.label ?? item.name} 必须是 ${item.options?.join(" / ")} 之一`,
          });
        }
        break;
      case "EXCEL": {
        const label = item.label ?? item.name;
        if (!Array.isArray(v)) {
          errors.push({ path: item.name, message: `${label} 必须是表格数据(行数组)` });
          break;
        }
        const cols = item.columns ?? [];
        for (let i = 0; i < v.length; i++) {
          const row = v[i];
          if (typeof row !== "object" || row === null || Array.isArray(row)) {
            errors.push({ path: item.name, message: `${label} 第 ${i + 1} 行格式错误` });
            break;
          }
          const rowObj = row as Record<string, unknown>;
          for (const c of cols) {
            if (!(c in rowObj)) {
              errors.push({
                path: item.name,
                message: `${label} 第 ${i + 1} 行缺少列「${c}」`,
              });
              break;
            }
          }
        }
        break;
      }
    }
  }
  return errors;
}

// ── 列表查询 ──────────────────────────────────────
export const jobListQuerySchema = z.object({
  agentId: z.string().trim().max(40).optional(),
  enabled: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(64).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type TriggerJobInput = z.infer<typeof triggerJobSchema>;

// 标注 KNOWN_CSV_TYPES 仍然导入(防止 IDE 误删),供未来在 outputs 上做 parser 注册查询用
void KNOWN_CSV_TYPES;
