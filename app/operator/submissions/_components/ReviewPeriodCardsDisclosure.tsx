"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export default function ReviewPeriodCardsDisclosure({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Collapsible open={open} onOpenChange={setOpen} className="flex min-w-0 flex-col gap-3">
    <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="w-fit"><ChevronDown data-icon="inline-start" className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")} />{open ? "收起其他周期" : `展开其他 ${count} 个周期`}</Button></CollapsibleTrigger>
    <CollapsibleContent>{children}</CollapsibleContent>
  </Collapsible>;
}
