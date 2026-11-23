"use client";

import { useCallback, useState } from "react";
import { inspirationCoverFit, type InspirationCardData } from "@/lib/inspiration-catalog";
import { cn } from "@/lib/utils";

export default function MediaCover({ src, item, onError }: {
  src: string;
  item: Pick<InspirationCardData, "tags">;
  onError: () => void;
}) {
  const [ratio, setRatio] = useState<number>();
  const measure = useCallback((image: HTMLImageElement | null) => {
    if (image?.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight);
  }, []);
  const fit = inspirationCoverFit(item, ratio);

  return (
    <img
      src={src}
      ref={measure}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={({ currentTarget }) => measure(currentTarget)}
      onError={onError}
      className={cn(
        "size-full",
        fit === "contain" && "object-contain p-1.5",
        fit === "top" && "object-cover object-top p-1.5",
        fit === "cover" && "inspiration-cover-image object-cover object-center",
      )}
    />
  );
}
