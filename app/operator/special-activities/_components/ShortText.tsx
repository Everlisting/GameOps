import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function ShortText({ text, href }: { text: string; href?: string }) {
  const letters = Array.from(text);
  const shortened = letters.length > 15;
  const visible = shortened ? `${letters.slice(0, 15).join("")}…` : text;
  const validHref = href && /^https?:\/\//i.test(href) ? href : undefined;
  const content = validHref
    ? <a href={validHref} target="_blank" rel="noreferrer" className="inline-block max-w-[15em] truncate align-middle hover:underline">{visible}</a>
    : <span tabIndex={shortened ? 0 : undefined} className="inline-block max-w-[15em] truncate align-middle">{visible}</span>;

  if (!shortened) return content;
  return <Tooltip>
    <TooltipTrigger asChild>{content}</TooltipTrigger>
    <TooltipContent variant={validHref ? "soft" : "default"} className="max-w-sm whitespace-normal break-words">{text}</TooltipContent>
  </Tooltip>;
}
