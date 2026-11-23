import { Clapperboard, LayoutTemplate } from "lucide-react";
import { defaultInspirationCover, type InspirationCardData } from "@/lib/inspiration-catalog";

export default function DocCover({ item }: { item: InspirationCardData }) {
  const image = defaultInspirationCover(item);
  if (image) {
    return <img src={image} alt="" loading="lazy" decoding="async" className="size-full object-cover" />;
  }

  if (item.category === "TEXT_STORY") {
    const excerpt = (item.summary?.trim() || item.content?.trim())?.replace(/\s+/g, " ");
    return (
      <span aria-hidden="true" className="inspiration-document-art inspiration-script-art">
        <span className="inspiration-document-sheet">
          <Clapperboard className="size-5" />
          {excerpt ? <span className="line-clamp-2 text-xs leading-5">{excerpt}</span> : <span className="inspiration-document-lines" />}
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="inspiration-document-art inspiration-template-art">
      <span className="inspiration-document-sheet">
        <LayoutTemplate className="size-5" />
        <span className="inspiration-template-layout"><span /><span /><span /></span>
      </span>
    </span>
  );
}
