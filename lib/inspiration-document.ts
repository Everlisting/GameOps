import { localInspirationUpload } from "./inspiration-files";

export function getInspirationDocument(url: string) {
  const upload = localInspirationUpload(url);
  if (upload?.kind === "doc" && /\.pdf$/i.test(upload.filename)) {
    return { kind: "pdf" as const, url };
  }

  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  if (link.protocol !== "https:" || link.username || link.password || link.port) return null;

  if (link.hostname === "docs.qq.com" && /^\/(doc|sheet|slide)\/[a-zA-Z0-9_-]+\/?$/.test(link.pathname)) {
    return { kind: "tencent-doc" as const, url: link.href };
  }

  const feishu = /^(?:[a-z0-9-]+\.)?(?:feishu\.cn|larksuite\.com)$/.test(link.hostname);
  if (feishu && /^\/(doc|docx|docs|wiki|sheets|base|slides|file)\/[a-zA-Z0-9_-]+\/?$/.test(link.pathname)) {
    return { kind: "feishu-doc" as const, url: link.href };
  }
  return null;
}
