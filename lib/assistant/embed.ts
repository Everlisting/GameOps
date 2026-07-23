/**
 * 阶段10.3 · 知识库 · 文本嵌入。
 *
 * 复用 AiModelProfile(usage="embedding") 的国产 OpenAI 兼容端点(数据不出境)。
 * 维度必须与 knowledge_chunk.embedding 的 vector(1024) 一致,否则入库/检索报错。
 */
import { embed, embedMany } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { AppError } from "@/lib/errors";
import { readInternalProfile } from "@/lib/assistant/settings";

export const EMBEDDING_DIM = 1024;

async function getEmbeddingModel() {
  const cfg = await readInternalProfile("embedding");
  const provider = createOpenAICompatible({
    name: cfg.provider,
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
  });
  return provider.textEmbeddingModel(cfg.model);
}

function assertDim(vec: number[]): number[] {
  if (vec.length !== EMBEDDING_DIM) {
    throw new AppError(
      "INTERNAL",
      `嵌入维度不匹配:期望 ${EMBEDDING_DIM},实际 ${vec.length}。请使用输出 ${EMBEDDING_DIM} 维的嵌入模型(如百炼 text-embedding-v3 / bge-m3)。`,
    );
  }
  return vec;
}

export async function embedOne(text: string): Promise<number[]> {
  const model = await getEmbeddingModel();
  const { embedding } = await embed({ model, value: text });
  return assertDim(embedding);
}

/** 分批嵌入:国产端点单次通常有条数上限(百炼 text-embedding-v3 = 20),取 10 稳妥。 */
const EMBED_BATCH = 10;

export async function embedBatch(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const model = await getEmbeddingModel();
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += EMBED_BATCH) {
    const { embeddings } = await embedMany({ model, values: values.slice(i, i + EMBED_BATCH) });
    for (const e of embeddings) out.push(assertDim(e));
  }
  return out;
}

/** number[] → pgvector 字面量 "[v1,v2,...]"。 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
