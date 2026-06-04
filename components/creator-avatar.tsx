import {
  Bird,
  Bot,
  Cat,
  Dog,
  Fish,
  Flame,
  Ghost,
  Heart,
  Rabbit,
  Rocket,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  getAvatarPreset,
  isAvatarPreset,
  type AvatarPresetKey,
} from "@/lib/avatar-presets";

const ICON_MAP: Record<AvatarPresetKey, LucideIcon> = {
  cat: Cat,
  dog: Dog,
  rabbit: Rabbit,
  bird: Bird,
  fish: Fish,
  bot: Bot,
  ghost: Ghost,
  rocket: Rocket,
  star: Star,
  heart: Heart,
  flame: Flame,
  sparkles: Sparkles,
};

/**
 * 统一渲染创作者头像:
 * 1) avatar 是预设 key → 彩色背景 + lucide 图标;
 * 2) 是 http(s) URL → 走 AvatarImage(兼容旧资料);
 * 3) 其余情况 → AvatarFallback 显示昵称首字母。
 */
export function CreatorAvatar({
  avatar,
  name,
  className,
  size,
}: {
  avatar?: string | null;
  name: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const fallbackInitial = name.trim().charAt(0).toUpperCase() || "U";

  if (isAvatarPreset(avatar)) {
    const preset = getAvatarPreset(avatar)!;
    const Icon = ICON_MAP[preset.key];
    return (
      <Avatar size={size} className={className}>
        <AvatarFallback
          className={cn(preset.bg, "text-white [&_svg]:size-1/2")}
        >
          <Icon />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar size={size} className={className}>
      {avatar && <AvatarImage src={avatar} alt={name} />}
      <AvatarFallback>{fallbackInitial}</AvatarFallback>
    </Avatar>
  );
}
