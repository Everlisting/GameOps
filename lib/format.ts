/**
 * 视图层格式化助手。仅做格式,不含业务。
 *
 * 时区:统一锁 Asia/Shanghai(北京时间)。
 * 服务端组件渲染时,Node 默认时区取决于 TZ env / 部署机器(阿里云常见默认 UTC),
 * 不显式指定的话前端看到的会跟北京时间差 8 小时。
 */
const TZ = "Asia/Shanghai";

const DATE_FMT = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});
const DATETIME_FMT = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

export function fmtDate(d: Date | string): string {
  return DATE_FMT.format(typeof d === "string" ? new Date(d) : d);
}
export function fmtDateTime(d: Date | string): string {
  return DATETIME_FMT.format(typeof d === "string" ? new Date(d) : d);
}
