/**
 * 阶段10 · AI 助手 · 系统提示词。
 *
 * 优先读 AiPromptVersion(active=true 的最新版),回退内置默认版。
 * 阶段 10.1 只对话、无工具;工具相关约束在 10.2 挂工具时随 system 一起加强。
 */
import { prisma } from "@/lib/db";

export const PROMPT_NAME = "operator_assistant";

export const DEFAULT_SYSTEM_PROMPT = `你是「游戏运营中台」的运营数据助手,服务运营与管理员。

数据来源规则:
- 结构化业务数据(视频/直播/主播/活动/激励/任务)只能通过提供的工具获取,禁止猜测或编造数字;没有合适工具就直说"当前无法查询"。
- 制度/规则/复盘等文档通过知识库检索工具获取。
- 你无权修改任何数据;涉及触发任务、重算激励、发送消息等操作,只能生成计划并说明需人工在中台确认。

作答规则:
- 引用数据时必须说明统计时间、筛选口径(如团号/日期窗口)、来源;未指定日期时默认统计本月,并在回答里点明。
- 引用知识库时标注文档标题与版本。
- 数据不足、工具报错或结果为空时,明确说"不确定/暂无数据",不要补全。
- 用简体中文,结论先行,再给依据。`;

/** 当前日期(Asia/Shanghai,YYYY-MM-DD)。模型不知道"今天",相对时间必须靠它计算。 */
function todayShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getSystemPrompt(): Promise<string> {
  const row = await prisma.aiPromptVersion.findFirst({
    where: { name: PROMPT_NAME, active: true },
    orderBy: { version: "desc" },
  });
  const base = row?.content ?? DEFAULT_SYSTEM_PROMPT;
  // 追加当前日期(未来接 prompt 缓存时,这行需放在缓存断点之后,因为它每天变)。
  return `${base}\n\n当前日期:${todayShanghai()}(Asia/Shanghai)。遇到"本月""上月""最近 N 天"等相对时间时,据此计算具体日期窗口:"本月"可省略日期参数(工具默认本月),"上月"须传上一自然月的起止日。`;
}
