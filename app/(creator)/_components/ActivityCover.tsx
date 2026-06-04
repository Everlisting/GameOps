/**
 * 活动封面图。无图片时渲染渐变占位 + 首字图标。
 */
export default function ActivityCover({
  src,
  alt,
  name,
  className = "",
}: {
  src: string | null | undefined;
  alt?: string;
  name: string;
  className?: string;
}) {
  if (src) {
    // 用原生 img 避免新增 next/image 远程域名白名单配置
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt ?? name}
        loading="lazy"
        className={"h-full w-full object-cover " + className}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={
        "flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-700/40 via-zinc-800 to-zinc-900 text-3xl font-semibold text-emerald-200/70 " +
        className
      }
    >
      {initial}
    </div>
  );
}
