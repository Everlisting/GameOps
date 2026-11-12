import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CHARACTERS_PER_LINE = 20;
const MAX_LINES = 3;

export default function VideoTitle({ text, href }: { text: string; href: string }) {
  const letters = Array.from(text.replace(/\s+/gu, " "));
  const limit = CHARACTERS_PER_LINE * MAX_LINES;
  const shortened = letters.length > limit;
  const visible = shortened ? [...letters.slice(0, limit - 1), "…"] : letters;
  const lines = Array.from({ length: Math.ceil(visible.length / CHARACTERS_PER_LINE) }, (_, index) =>
    visible.slice(index * CHARACTERS_PER_LINE, (index + 1) * CHARACTERS_PER_LINE).join("")
  );
  const title = <span className="inline-block w-[20em] max-w-full align-middle text-xs leading-5">
    {lines.map((line, index) => <span key={index} className="block truncate">{line}</span>)}
  </span>;
  const content = /^https?:\/\//i.test(href)
    ? <a href={href} target="_blank" rel="noreferrer" className="inline-block max-w-full align-middle hover:underline">{title}</a>
    : <span tabIndex={shortened ? 0 : undefined} className="inline-block max-w-full align-middle">{title}</span>;

  if (!shortened) return content;
  return <Tooltip>
    <TooltipTrigger asChild>{content}</TooltipTrigger>
    <TooltipContent variant="soft" className="max-w-sm whitespace-normal break-words">{text}</TooltipContent>
  </Tooltip>;
}
