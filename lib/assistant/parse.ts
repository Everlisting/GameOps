/**
 * 阶段10.3 · 知识库 · 文件文本抽取(在后台 indexer 里调用,不阻塞上传)。
 *
 * 文本类直读;docx→mammoth;pdf→unpdf 抽文字层,无文字层(扫描件)回退 OCR;图片→OCR。
 * OCR 用 tesseract.js(chi_sim+eng),扫描版 pdf 先用 pdf-to-img 光栅化再逐页 OCR。
 * 解析器/OCR 按需动态 import。
 */
import { createWorker } from "tesseract.js";

const IMAGE_RE = /\.(png|jpe?g|webp|bmp|tiff?|gif)$/i;

async function ocrImage(buf: Buffer): Promise<string> {
  const worker = await createWorker("chi_sim+eng");
  try {
    const { data } = await worker.recognize(buf);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}

async function ocrPdf(buf: Buffer): Promise<string> {
  const { pdf } = await import("pdf-to-img");
  const worker = await createWorker("chi_sim+eng");
  try {
    const doc = await pdf(buf, { scale: 2 });
    const texts: string[] = [];
    for await (const page of doc) {
      const { data } = await worker.recognize(page);
      texts.push(data.text);
    }
    return texts.join("\n\n").trim();
  } finally {
    await worker.terminate();
  }
}

export async function extractText(buf: Buffer, filename: string, mimeType: string): Promise<string> {
  const name = filename.toLowerCase();

  if (mimeType.startsWith("text/") || /\.(md|markdown|txt|csv|json)$/i.test(name)) {
    return buf.toString("utf8").trim();
  }

  if (name.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
    const { extractRawText } = await import("mammoth");
    const { value } = await extractRawText({ buffer: buf });
    return value.trim();
  }

  if (name.endsWith(".pdf") || mimeType === "application/pdf") {
    const { extractText: extractPdf } = await import("unpdf");
    const { text } = await extractPdf(new Uint8Array(buf), { mergePages: true });
    const t = text.trim();
    if (t.length >= 20) return t; // 有文字层
    return ocrPdf(buf); // 疑似扫描版 → OCR
  }

  if (IMAGE_RE.test(name) || mimeType.startsWith("image/")) {
    return ocrImage(buf);
  }

  throw new Error("不支持的文件类型(支持 txt / md / csv / json / docx / pdf / 图片)");
}

const SUPPORTED_RE = /\.(md|markdown|txt|csv|json|docx|pdf|png|jpe?g|webp|bmp|tiff?|gif)$/i;

/** 上传时的快速类型校验(真正解析在后台)。 */
export function isSupportedFile(filename: string, mimeType: string): boolean {
  return (
    SUPPORTED_RE.test(filename) ||
    mimeType.startsWith("text/") ||
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    mimeType.includes("wordprocessingml")
  );
}
