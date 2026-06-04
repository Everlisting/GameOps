/**
 * 阶段4 改造后的爬虫体系 zod schema + csvType 注册表(标签)。
 *
 * 重构要点:
 *   - 废除"按 csvType 抢占"模型,任务必绑定 Agent,改走 Job/Task 两层。
 *   - kind / capabilities 字段已删除;csvType 现在挂在 Job.outputs[] 上,parser 注册仍以 csvType 为键。
 *   - 任务管理(创建/手动取消)入口收敛到 /api/admin/jobs/*,这里只保留 Agent CRUD + 通用 Task 查询 + Agent 协议层的 zod。
 */
import { z } from "zod";

// ── csvType 注册 ───────────────────────────────────
export const KNOWN_CSV_TYPES = ["douyin_video_detail"] as const;

export const CSV_TYPE_LABEL: Record<string, string> = {
  douyin_video_detail: "抖音视频明细表",
};

// ── 管理员侧:Agent CRUD ────────────────────────────
const trimNonEmpty = (max: number) => z.string().trim().min(1).max(max);

export const agentCreateSchema = z.object({
  name: trimNonEmpty(64),
});

export const agentUpdateSchema = z.object({
  name: trimNonEmpty(64).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

// ── 管理员侧:Task 维护(仅 cancel/重排优先级) ──────
/**
 * 管理员可以:
 *   - status=CANCELED:立刻终止(PENDING / RUNNING 都行;agent 后续上报视为已取消)
 *   - status=PENDING:把 FAILED / CANCELED 任务重置回排队(也会清掉 startedAt / errorMessage)
 *   - priority:调整队列顺序
 */
export const taskUpdateSchema = z.object({
  status: z.enum(["CANCELED", "PENDING"]).optional(),
  priority: z.number().int().min(-100).max(100).optional(),
});

// ── Agent 侧:协议 ──────────────────────────────────
export const heartbeatRequestSchema = z.object({
  agentStatus: z.enum(["idle", "busy"]).optional(),
  version: z.string().max(64).optional(),
});

/**
 * /api/agent/tasks/claim 请求体:重构后 agent 不再传 csvTypes 筛选,
 * 服务端按 `WHERE agentId = <self>` 取自己的队列。空 body 即可。
 */
export const claimRequestSchema = z.object({}).default({});

export const taskResultStatusSchema = z.enum(["success", "failure", "no_data"]);

// ── 列表查询 ─────────────────────────────────────
export const agentListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  q: z.string().trim().max(64).optional(),
});

export const taskListQuerySchema = z.object({
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]).optional(),
  trigger: z.enum(["AUTO", "MANUAL"]).optional(),
  jobId: z.string().trim().max(40).optional(),
  agentId: z.string().trim().max(40).optional(),
});

export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
