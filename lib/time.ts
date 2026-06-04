/**
 * 时区相关工具。
 *
 * 中台业务上"今天"一律指**北京时间**(UTC+8),即使服务器时区是 UTC。
 *   - 每日快照、每日汇总,都按这一约定。
 *
 * 实现思路:
 *   把传入时刻 + 8h 后,取其 UTC 字段(此时正好等于北京时间字段),
 *   再用 Date.UTC 构造 UTC midnight 的 Date。
 *
 * 例:
 *   UTC 2026-06-01T16:30Z  → 北京时间 2026-06-02T00:30  → 返回 UTC 2026-06-02T00:00Z
 *   写入 `@db.Date` 字段后 Postgres 存 2026-06-02,业务理解为"北京时间这一天"。
 */
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 北京时间 d 当天的 UTC midnight Date(用于 @db.Date 字段)。默认 d=now() */
export function chinaDateStart(d: Date = new Date()): Date {
  const beijing = new Date(d.getTime() + CHINA_OFFSET_MS);
  return new Date(
    Date.UTC(
      beijing.getUTCFullYear(),
      beijing.getUTCMonth(),
      beijing.getUTCDate(),
    ),
  );
}

/** 返回 "YYYY-MM-DD"(北京时间日期)字符串。仅展示用。 */
export function chinaDateString(d: Date = new Date()): string {
  const beijing = new Date(d.getTime() + CHINA_OFFSET_MS);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const day = String(beijing.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
