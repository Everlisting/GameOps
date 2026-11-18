import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Empty({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex flex-col items-center justify-center gap-5 px-6 py-16 text-center",
        className,
      )}
      {...props}
    />
  );
}
function EmptyHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-md flex-col items-center gap-3", className)}
      {...props}
    />
  );
}
function EmptyMedia({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-media"
      className={cn("text-muted-foreground [&_svg]:size-7", className)}
      {...props}
    />
  );
}
function EmptyTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="empty-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}
function EmptyDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
function EmptyContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn("flex items-center justify-center gap-3", className)}
      {...props}
    />
  );
}
export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
};
