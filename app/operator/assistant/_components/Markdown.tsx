"use client";

/**
 * AI 助手 · Markdown 渲染(带 GFM 表格)。用 Tailwind 类给各元素上样式,不依赖 typography 插件。
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ node, ...p }) => <p className="my-1 leading-relaxed first:mt-0 last:mb-0" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...p} />,
  h1: ({ node, ...p }) => <h1 className="mb-1 mt-2 text-base font-semibold first:mt-0" {...p} />,
  h2: ({ node, ...p }) => <h2 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...p} />,
  h3: ({ node, ...p }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...p} />,
  a: ({ node, ...p }) => (
    <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
  ),
  code: ({ node, ...p }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...p} />
  ),
  pre: ({ node, ...p }) => (
    <pre className="my-2 overflow-x-auto rounded bg-muted p-2 text-xs" {...p} />
  ),
  blockquote: ({ node, ...p }) => (
    <blockquote className="my-1 border-l-2 pl-3 text-muted-foreground" {...p} />
  ),
  table: ({ node, ...p }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...p} />
    </div>
  ),
  thead: ({ node, ...p }) => <thead className="bg-muted/60" {...p} />,
  th: ({ node, ...p }) => <th className="border px-2 py-1 text-left font-medium" {...p} />,
  td: ({ node, ...p }) => <td className="border px-2 py-1" {...p} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
