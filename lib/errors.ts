/**
 * 统一错误类型。业务代码抛 AppError,API 层用 handleApiError 转响应。
 */
export type ErrorCode =
  | "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403,
  NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expected: boolean;
  constructor(code: ErrorCode, message: string, options: { details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.expected = code !== "INTERNAL";
    Object.setPrototypeOf(this, AppError.prototype);
  }
  toResponseBody() {
    return { error: { code: this.code, message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}) } };
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError("BAD_REQUEST", m, { details: d });
export const unauthorized = (m = "未授权") => new AppError("UNAUTHORIZED", m);
export const forbidden = (m = "无权访问") => new AppError("FORBIDDEN", m);
export const notFound = (m = "资源不存在") => new AppError("NOT_FOUND", m);
export const conflict = (m: string, d?: unknown) => new AppError("CONFLICT", m, { details: d });
