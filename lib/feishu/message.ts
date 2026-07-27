/**
 * 飞书消息构造:纯文本 + 交互卡片(lark_md)。
 */
import type { FeishuPayload } from "@/lib/feishu/client";
import { mdToCardElements } from "@/lib/feishu/markdown";

/** 纯文本消息。 */
export function textMessage(text: string): FeishuPayload {
  return { msg_type: "text", content: { text } };
}

export interface CardSection {
  /** 小标题(可选) */
  title?: string;
  /** lark_md 正文 */
  content: string;
}

/** 交互卡片:标题头 + 若干区块(区块间自动加分隔线)。 */
export function cardMessage(
  headerTitle: string,
  sections: CardSection[],
  template: "blue" | "turquoise" | "green" | "grey" = "blue",
): FeishuPayload {
  const elements: unknown[] = [];
  sections.forEach((s, i) => {
    if (i > 0) elements.push({ tag: "hr" });
    const md = s.title ? `**${s.title}**\n${s.content}` : s.content;
    elements.push({ tag: "div", text: { tag: "lark_md", content: md } });
  });
  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: headerTitle }, template },
      elements,
    },
  };
}

/**
 * 富文本卡片(schema 2.0):把一段 markdown 渲染成飞书卡片 —— 表格转 table 组件、
 * 其余转 markdown 组件,`[文本](url)` 链接可点击。用于发送助手生成的分析/自定义内容。
 */
export function richCardMessage(
  headerTitle: string,
  markdown: string,
  template: "blue" | "turquoise" | "green" | "grey" = "blue",
): FeishuPayload {
  return {
    msg_type: "interactive",
    card: {
      schema: "2.0",
      config: { wide_screen_mode: true, width_mode: "fill" },
      header: { title: { tag: "plain_text", content: headerTitle }, template },
      body: { elements: mdToCardElements(markdown) },
    },
  };
}
