import {
  BookOpen,
  Flame,
  Heart,
  Medal,
  Rocket,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
  type LucideIcon, Brain, Compass, Crown, Gamepad2, Music, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  rocket: Rocket,
  flame: Flame,
  heart: Heart,
  target: Target,
  trophy: Trophy,
  rotate: RotateCcw,
  zap: Zap,
  book: BookOpen,
  crown: Crown,
  compass: Compass,
  music: Music,
  brain: Brain,
  swords: Swords,
  gamepad: Gamepad2,
};

export const BADGE_ICON_KEYS = Object.keys(ICONS);

export function BadgeIcon({
  icon,
  earned = true,
  className,
}: {
  icon: string;
  earned?: boolean;
  className?: string;
}) {
  const Icon = ICONS[icon] ?? Medal;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-2xl",
        earned
          ? "bg-primary-soft text-primary-ink"
          : "bg-surface-muted text-muted",
        className,
      )}
    >
      <Icon className="size-6" />
    </span>
  );
}
