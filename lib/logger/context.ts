/**
 * 链路上下文传播(AsyncLocalStorage)。
 * route() / worker 在处理入口 runWith(...) 起一段上下文,logger 每条自动并入 requestId/traceId 等。
 * 详见 docs/logging.md §4。仅 Node runtime;Edge logger 显式传上下文,不走这里。
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { LogContext } from "@/lib/logger/schema";

const storage = new AsyncLocalStorage<LogContext>();

/** 在给定上下文内运行 fn;嵌套时与父上下文浅合并。 */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...ctx }, fn);
}

/** 取当前链路上下文(无则 undefined)。 */
export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * 原地补充当前上下文(如鉴权解析出角色后回填 userIdHash/role)。
 * 只在已有 store 时生效——store 是同一对象引用,run 期间可变更。
 */
export function updateLogContext(patch: Partial<LogContext>): void {
  const store = storage.getStore();
  if (store) Object.assign(store, patch);
}
