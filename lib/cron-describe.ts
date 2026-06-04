/**
 * 把 cron 表达式翻译成中文人话:`0 8 * * *` → "每天 上午 8:00"。
 * 仅前端展示用。计算下次执行时间仍走 lib/cron-scheduler 的 cron-parser。
 */
import cronstrue from "cronstrue/i18n";

/**
 * 给一个 5 段 cron 表达式生成中文描述。
 * 非法或解析失败时返回原表达式,保证 UI 不崩。
 */
export function describeCron(expr: string | null | undefined): string {
  if (!expr) return "—";
  const trimmed = expr.trim();
  if (!trimmed) return "—";
  try {
    return cronstrue.toString(trimmed, {
      locale: "zh_CN",
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
  } catch {
    return trimmed; // fallback,UI 不会因 cronstrue 抛错而 500
  }
}
