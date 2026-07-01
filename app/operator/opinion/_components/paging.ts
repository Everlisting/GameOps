/**
 * 分页 · URL 参数校验。三个列表页共用。
 * pageSize 白名单:20 / 50 / 100 / 200(默认 50)。
 */
const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

export function clampPage(raw: string | undefined, fallback = 1): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function clampPageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}
