/**
 * 预设头像注册表。
 * Creator.avatarUrl 可存:
 *   - 这里某个预设 key(节约资源,不走外链);
 *   - 以 http(s):// 开头的合法 URL(旧资料兼容);
 *   - null / "" 表示未设置(显示昵称首字母)。
 */
export const AVATAR_PRESETS = [
  { key: "cat", label: "猫", bg: "bg-amber-500" },
  { key: "dog", label: "狗", bg: "bg-orange-500" },
  { key: "rabbit", label: "兔", bg: "bg-pink-500" },
  { key: "bird", label: "鸟", bg: "bg-sky-500" },
  { key: "fish", label: "鱼", bg: "bg-cyan-500" },
  { key: "bot", label: "机器人", bg: "bg-zinc-600" },
  { key: "ghost", label: "幽灵", bg: "bg-violet-500" },
  { key: "rocket", label: "火箭", bg: "bg-rose-500" },
  { key: "star", label: "星星", bg: "bg-yellow-500" },
  { key: "heart", label: "爱心", bg: "bg-red-500" },
  { key: "flame", label: "火焰", bg: "bg-orange-600" },
  { key: "sparkles", label: "闪光", bg: "bg-fuchsia-500" },
] as const;

export type AvatarPresetKey = (typeof AVATAR_PRESETS)[number]["key"];

const KEY_SET = new Set<string>(AVATAR_PRESETS.map((p) => p.key));

export function isAvatarPreset(s: string | null | undefined): s is AvatarPresetKey {
  return typeof s === "string" && KEY_SET.has(s);
}

export function getAvatarPreset(key: string) {
  return AVATAR_PRESETS.find((p) => p.key === key);
}
