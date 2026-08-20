/**
 * Job 参数默认值的纯函数。
 *
 * - paramSchema.default:管理员配置的 cron 参数，也作为从未手动运行时的表单初始值。
 * - manualParamDefaults:最近一次手动触发的标量参数，仅用于手动表单预填。
 *
 * 两者必须分开存储；手动触发绝不能改写 paramSchema.default。
 */

export type JobParamDefinition = {
  name: string;
  type: "DATE" | "STRING" | "NUMBER" | "ENUM" | "EXCEL";
  default?: string | number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isRememberableScalar(value: unknown): value is string | number {
  return (
    (typeof value === "string" && value !== "") ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/** cron 每次到点只读取管理员配置的 paramSchema.default。 */
export function buildCronParamValues(
  schema: JobParamDefinition[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const item of schema) {
    if (item.default !== undefined) values[item.name] = item.default;
  }
  return values;
}

/**
 * 从一次手动触发中生成新的手动记忆快照。
 * EXCEL 不持久化，避免把整张表长期写进 Job；空值会清掉旧记忆。
 */
export function buildManualParamDefaults(
  schema: JobParamDefinition[],
  paramValues: Record<string, unknown>,
): Record<string, string | number> {
  const remembered: Record<string, string | number> = {};
  for (const item of schema) {
    if (item.type === "EXCEL") continue;
    const value = paramValues[item.name];
    if (isRememberableScalar(value)) remembered[item.name] = value;
  }
  return remembered;
}

/** 手动表单优先用独立记忆；没有记忆的字段才回退到 cron 默认值。 */
export function buildManualTriggerInitialValues(
  schema: JobParamDefinition[],
  manualParamDefaults: unknown,
): Record<string, unknown> {
  const remembered = asRecord(manualParamDefaults);
  const values: Record<string, unknown> = {};
  for (const item of schema) {
    const manualValue = remembered[item.name];
    if (item.type !== "EXCEL" && isRememberableScalar(manualValue)) {
      values[item.name] = manualValue;
    } else if (item.default !== undefined) {
      values[item.name] = item.default;
    }
  }
  return values;
}
